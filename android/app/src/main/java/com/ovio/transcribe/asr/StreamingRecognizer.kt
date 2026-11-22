package com.ovio.transcribe.asr

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineTransducerModelConfig
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig
import com.ovio.transcribe.data.ModelCatalog
import com.ovio.transcribe.data.ModelOption
import java.io.File
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import kotlin.math.sqrt

/**
 * Real-time on-device transcription pipeline:
 *
 *   mic -> AudioRecord (16 kHz mono)
 *       -> Silero VAD (sherpa-onnx)  -> clean speech segments
 *       -> Parakeet TDT offline recognizer
 *
 * One worker thread does everything in order, so results are always emitted
 * in chronological sequence:
 *
 *  - when a speech segment ends, it is decoded and the text is emitted once
 *    and for all via [Listener.onConfirmedTranscript];
 *  - while you are still speaking, the last ~12 seconds of audio are
 *    re-decoded every few seconds and emitted via [Listener.onPartialTranscript]
 *    so text appears live and grows as you speak. This is the same
 *    "simulated streaming" approach the official sherpa-onnx Parakeet
 *    Android apps use (Parakeet itself is an offline model).
 */
class StreamingRecognizer(
    context: Context,
    option: ModelOption,
    private val listener: Listener,
    private val asrThreads: Int = 2,
) : AutoCloseable {

    interface Listener {
        /** Live preview of the utterance currently in progress (kept up to date). */
        fun onPartialTranscript(text: String)

        /** Final text for one finished speech segment, in chronological order. */
        fun onConfirmedTranscript(text: String)

        /** RMS of the most recent audio chunk, 0..1 (drives the waveform UI). */
        fun onAmplitude(rms: Float)

        fun onError(message: String)
    }

    private val modelDir =
        File(context.filesDir, ModelCatalog.MODEL_ROOT + "/" + option.directoryName)
    private val vadFile =
        File(context.filesDir, ModelCatalog.MODEL_ROOT + "/" + ModelCatalog.VAD_FILE_NAME)

    private val recognizer: OfflineRecognizer
    private val vad: Vad

    private val audioQueue = LinkedBlockingQueue<FloatArray>()
    private val running = AtomicBoolean(false)
    private val stopping = AtomicBoolean(false)

    private var audioRecord: AudioRecord? = null
    private var micThread: Thread? = null
    private var workerThread: Thread? = null

    init {
        val recognizerConfig = OfflineRecognizerConfig(
            featConfig = FeatureConfig(sampleRate = SAMPLE_RATE),
            modelConfig = OfflineModelConfig(
                transducer = OfflineTransducerModelConfig(
                    encoder = File(modelDir, "encoder.int8.onnx").absolutePath,
                    decoder = File(modelDir, "decoder.int8.onnx").absolutePath,
                    joiner = File(modelDir, "joiner.int8.onnx").absolutePath,
                ),
                tokens = File(modelDir, "tokens.txt").absolutePath,
                numThreads = asrThreads,
                provider = "cpu",
                modelType = "nemo_transducer",
            ),
            decodingMethod = "greedy_search",
        )
        recognizer = OfflineRecognizer(config = recognizerConfig)

        val vadConfig = VadModelConfig(
            sileroVadModelConfig = SileroVadModelConfig(
                model = vadFile.absolutePath,
                threshold = 0.5f,
                minSilenceDuration = 0.45f,
                minSpeechDuration = 0.25f,
                windowSize = 512,
                maxSpeechDuration = 20f,
            ),
            sampleRate = SAMPLE_RATE,
            numThreads = 1,
            provider = "cpu",
        )
        vad = Vad(config = vadConfig)
    }

    /** Starts the mic + worker loop. Returns false if the mic could not start. */
    fun start(): Boolean {
        if (!running.compareAndSet(false, true)) return true
        stopping.set(false)
        audioQueue.clear()

        val record = createAudioRecord()
        if (record == null) {
            running.set(false)
            listener.onError("Could not start the microphone. Check the mic permission.")
            return false
        }
        audioRecord = record

        workerThread = thread(name = "asr-worker") { workerLoop() }
        micThread = thread(name = "mic-reader") { micLoop(record) }
        return true
    }

    /** Stops quietly: flushes the VAD, decodes any remaining tail, frees the mic. */
    fun stop() {
        if (!running.compareAndSet(true, false)) return
        stopping.set(true)
        try {
            workerThread?.join(8_000)
        } catch (_: InterruptedException) {
        }
        workerThread = null
        micThread = null
        try {
            audioRecord?.stop()
        } catch (_: Throwable) {
        }
        audioRecord?.release()
        audioRecord = null
        vad.reset()
        listener.onPartialTranscript("")
    }

    override fun close() {
        stop()
        runCatching { vad.release() }
        runCatching { recognizer.release() }
    }

    // ------------------------------------------------------------------ //
    // Mic capture
    // ------------------------------------------------------------------ //

    private fun createAudioRecord(): AudioRecord? = try {
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuffer, SAMPLE_RATE) * 2,
        ).takeIf { it.state == AudioRecord.STATE_INITIALIZED }
    } catch (_: Throwable) {
        null
    }

    @SuppressLint("MissingPermission") // permission is requested in the UI before start()
    private fun micLoop(record: AudioRecord) {
        try {
            record.startRecording()
        } catch (t: Throwable) {
            listener.onError("Recording failed to start: ${t.message}")
            running.set(false)
            return
        }
        val shortBuffer = ShortArray(CHUNK_SAMPLES)
        while (running.get()) {
            val read = record.read(shortBuffer, 0, shortBuffer.size) // blocks until data
            if (read <= 0) continue
            val floats = FloatArray(read) { i -> shortBuffer[i] / 32768f }
            listener.onAmplitude(rms(floats))
            // Safety valve: if the device simply cannot keep up, drop the
            // oldest audio instead of growing memory forever.
            while (audioQueue.size >= MAX_QUEUED_CHUNKS) {
                audioQueue.poll()
            }
            audioQueue.offer(floats)
        }
    }

    // ------------------------------------------------------------------ //
    // VAD + ASR worker
    // ------------------------------------------------------------------ //

    private fun workerLoop() {
        // Rolling copy of the last [PREVIEW_WINDOW_SECONDS] s of audio, used
        // for the live preview while speech is ongoing.
        val rolling = ArrayDeque<FloatArray>()
        var rollingSamples = 0

        var speechInProgress = false
        var speechStartMs = 0L
        var lastPreviewMs = 0L

        try {
            while (running.get()) {
                val chunk = audioQueue.poll(20, TimeUnit.MILLISECONDS) ?: continue

                // --- VAD bookkeeping ---
                vad.acceptWaveform(chunk)
                while (!vad.empty()) {
                    val segment = vad.front()
                    vad.pop()
                    if (segment.samples.isNotEmpty()) {
                        transcribe(segment.samples)?.let { text ->
                            if (text.isNotBlank()) listener.onConfirmedTranscript(text)
                        }
                    }
                    listener.onPartialTranscript("") // pending text is now confirmed
                }

                val isSpeech = vad.isSpeechDetected()
                if (isSpeech && !speechInProgress) {
                    speechInProgress = true
                    speechStartMs = System.currentTimeMillis()
                    lastPreviewMs = 0L // preview as soon as ~1 s has been collected
                } else if (!isSpeech && speechInProgress) {
                    speechInProgress = false
                }

                // --- rolling preview buffer ---
                rolling.addLast(chunk)
                rollingSamples += chunk.size
                while (rollingSamples > PREVIEW_WINDOW_SECONDS * SAMPLE_RATE) {
                    val dropped = rolling.removeFirst()
                    rollingSamples -= dropped.size
                }

                // --- periodic live preview ---
                if (speechInProgress) {
                    val now = System.currentTimeMillis()
                    val speechDuration = now - speechStartMs
                    if (speechDuration >= 1_000 &&
                        now - lastPreviewMs >= PREVIEW_INTERVAL_MS
                    ) {
                        lastPreviewMs = now
                        val tail = FloatArray(rollingSamples)
                        var offset = 0
                        for (part in rolling) {
                            part.copyInto(tail, offset)
                            offset += part.size
                        }
                        transcribe(tail)?.let { text ->
                            if (text.isNotBlank()) listener.onPartialTranscript(text)
                        }
                    }
                }
            }

            // Stop requested: flush the VAD and decode whatever is still queued.
            if (stopping.get()) {
                vad.flush()
                while (!vad.empty()) {
                    val segment = vad.front()
                    vad.pop()
                    transcribe(segment.samples)?.let { text ->
                        if (text.isNotBlank()) listener.onConfirmedTranscript(text)
                    }
                }
            }
        } catch (t: Throwable) {
            listener.onError("Transcription error: ${t.message ?: t.javaClass.simpleName}")
        }
    }

    private fun transcribe(samples: FloatArray): String? = try {
        val stream = recognizer.createStream()
        stream.acceptWaveform(samples, SAMPLE_RATE)
        recognizer.decode(stream)
        val result = recognizer.getResult(stream)
        stream.release()
        result.text.trim()
    } catch (t: Throwable) {
        listener.onError("Decode failed: ${t.message ?: t.javaClass.simpleName}")
        null
    }

    private fun rms(x: FloatArray): Float {
        var acc = 0.0
        for (v in x) acc += v.toDouble() * v
        return sqrt(acc / x.size).toFloat()
    }

    companion object {
        const val SAMPLE_RATE = 16_000

        /** 32 ms — matches Silero VAD's internal window size. */
        const val CHUNK_SAMPLES = 512
        const val PREVIEW_INTERVAL_MS = 2_500L
        const val PREVIEW_WINDOW_SECONDS = 12
        const val MAX_QUEUED_CHUNKS = 400 // ~12.8 s of buffered audio max

        fun isModelDownloaded(context: Context, option: ModelOption): Boolean {
            val dir = File(context.filesDir, ModelCatalog.MODEL_ROOT + "/" + option.directoryName)
            return option.fileNames.all { File(dir, it).length() > 0 }
        }
    }
}

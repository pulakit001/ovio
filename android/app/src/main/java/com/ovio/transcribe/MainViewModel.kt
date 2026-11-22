package com.ovio.transcribe

import android.app.Application
import android.content.ContentValues
import android.net.Uri
import android.provider.MediaStore
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ovio.transcribe.asr.StreamingRecognizer
import com.ovio.transcribe.data.DownloadProgress
import com.ovio.transcribe.data.ModelCatalog
import com.ovio.transcribe.data.ModelDownloader
import com.ovio.transcribe.data.ModelOption
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Download/ready state of one Parakeet model. */
data class ModelStatus(
    val option: ModelOption,
    val downloaded: Boolean,
    val sizeBytes: Long,
)

data class DownloadUi(
    val optionId: String,
    val label: String,
    val fraction: Float?,
    val error: String?,
)

sealed interface EngineState {
    data object NotReady : EngineState
    data object Loading : EngineState
    data class Ready(val optionId: String) : EngineState
    data class Failed(val message: String) : EngineState
}

data class TranscriptUi(
    val confirmedSegments: List<String> = emptyList(),
    val pendingText: String = "",
)

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val downloader = ModelDownloader(application)
    private val downloadMutex = Mutex()

    // ------------------------------------------------------------------ //
    // Setup / download state
    // ------------------------------------------------------------------ //

    private val _modelStatuses = MutableStateFlow(emptyList<ModelStatus>())
    val modelStatuses: StateFlow<List<ModelStatus>> = _modelStatuses.asStateFlow()

    private val _vadReady = MutableStateFlow(false)
    val vadReady: StateFlow<Boolean> = _vadReady.asStateFlow()

    private val _download = MutableStateFlow<DownloadUi?>(null)
    val download: StateFlow<DownloadUi?> = _download.asStateFlow()

    private val _selectedModelId = MutableStateFlow<String?>(null)
    val selectedModelId: StateFlow<String?> = _selectedModelId.asStateFlow()

    // ------------------------------------------------------------------ //
    // Engine state
    // ------------------------------------------------------------------ //

    private val _engineState = MutableStateFlow<EngineState>(EngineState.NotReady)
    val engineState: StateFlow<EngineState> = _engineState.asStateFlow()

    private val _recording = MutableStateFlow(false)
    val recording: StateFlow<Boolean> = _recording.asStateFlow()

    private val _transcript = MutableStateFlow(TranscriptUi())
    val transcript: StateFlow<TranscriptUi> = _transcript.asStateFlow()

    private val _amplitudes = MutableStateFlow(emptyList<Float>())
    val amplitudes: StateFlow<List<Float>> = _amplitudes.asStateFlow()

    private val _elapsedSeconds = MutableStateFlow(0L)
    val elapsedSeconds: StateFlow<Long> = _elapsedSeconds.asStateFlow()

    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    private val confirmedSegments = mutableListOf<String>()
    private var engine: StreamingRecognizer? = null
    private var engineForOptionId: String? = null
    private var timerJob: Job? = null
    private var startedAt = 0L

    init {
        refreshStatuses()
        _selectedModelId.value = ModelCatalog.parakeetOptions
            .firstOrNull { downloader.isModelComplete(it) }?.id
    }

    fun selectedOption(): ModelOption? =
        ModelCatalog.parakeetOptions.firstOrNull { it.id == _selectedModelId.value }

    fun selectModel(id: String) {
        _selectedModelId.value = id
        if (engineForOptionId != null && engineForOptionId != id) {
            // A different model was chosen: force a re-load before next recording.
            viewModelScope.launch(Dispatchers.IO) {
                engine?.close()
                engine = null
                engineForOptionId = null
                _engineState.update { EngineState.NotReady }
            }
        }
    }

    fun refreshStatuses() {
        _modelStatuses.value = ModelCatalog.parakeetOptions.map {
            ModelStatus(it, downloader.isModelComplete(it), downloader.modelSizeBytes(it))
        }
        _vadReady.value = downloader.isVadComplete()
    }

    // ------------------------------------------------------------------ //
    // Downloads
    // ------------------------------------------------------------------ //

    fun downloadModel(option: ModelOption) {
        viewModelScope.launch {
            downloadMutex.withLock {
                // 1) Silero VAD (tiny) — required before anything can work.
                if (!downloader.isVadComplete()) {
                    val vad = downloader.downloadVad { done, total ->
                        _download.value = DownloadUi(
                            optionId = option.id,
                            label = "Silero VAD (voice activity)",
                            fraction = if (total > 0) done.toFloat() / total else null,
                            error = null,
                        )
                    }
                    if (vad.isFailure) {
                        _download.value = DownloadUi(
                            optionId = option.id,
                            label = "",
                            fraction = null,
                            error = "VAD download failed — " +
                                (vad.exceptionOrNull()?.message ?: "unknown error"),
                        )
                        return@withLock
                    }
                }

                // 2) The Parakeet model files.
                val result = downloader.downloadOption(option) { progress ->
                    _download.value = progress.toUi(option)
                }
                result.fold(
                    onSuccess = {
                        _download.value = null
                        refreshStatuses()
                        _notice.value = "${option.displayName} is ready. Transcription runs fully offline now."
                    },
                    onFailure = { e ->
                        _download.value = DownloadUi(
                            optionId = option.id,
                            label = "",
                            fraction = null,
                            error = e.message ?: "Download failed",
                        )
                        refreshStatuses()
                    },
                )
            }
        }
    }

    private fun DownloadProgress.toUi(option: ModelOption): DownloadUi = DownloadUi(
        optionId = optionId,
        label = "${currentFileName} (${fileIndex + 1}/$fileCount)",
        fraction = overallFraction(),
        error = error,
    )

    fun deleteModel(option: ModelOption) {
        viewModelScope.launch(Dispatchers.IO) {
            if (engineForOptionId == option.id) {
                engine?.close()
                engine = null
                engineForOptionId = null
            }
            downloader.deleteModelDir(option)
            refreshStatuses()
            _engineState.update { EngineState.NotReady }
        }
    }

    // ------------------------------------------------------------------ //
    // Recording & transcription
    // ------------------------------------------------------------------ //

    fun toggleRecording(hasMicPermission: Boolean) {
        if (!hasMicPermission) return // the UI asks for permission first
        if (_recording.value) {
            _recording.value = false
            timerJob?.cancel()
            timerJob = null
            viewModelScope.launch(Dispatchers.IO) {
                engine?.stop()
            }
        } else {
            viewModelScope.launch {
                val option = selectedOption()
                if (option == null || !downloader.isModelComplete(option)) {
                    _notice.value = "Download a Parakeet model in Setup first."
                    return@launch
                }
                if (!downloader.isVadComplete()) {
                    _notice.value = "Silero VAD file is missing — restart the model download."
                    return@launch
                }
                val eng = ensureEngine(option) ?: return@launch
                startedAt = System.currentTimeMillis()
                _elapsedSeconds.value = 0
                if (eng.start()) {
                    _recording.value = true
                    startTimer()
                } else {
                    _engineState.value = EngineState.Failed("Microphone unavailable")
                }
            }
        }
    }

    private fun startTimer() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            while (isActive) {
                _elapsedSeconds.value = (System.currentTimeMillis() - startedAt) / 1000
                delay(500)
            }
        }
    }

    private suspend fun ensureEngine(option: ModelOption): StreamingRecognizer? {
        engine?.let { if (engineForOptionId == option.id) return it }
        if (_engineState.value == EngineState.Loading) return null
        _engineState.value = EngineState.Loading
        return withContext(Dispatchers.IO) {
            try {
                StreamingRecognizer(
                    context = getApplication(),
                    option = option,
                    listener = listener,
                    asrThreads = 2,
                ).also {
                    engine = it
                    engineForOptionId = option.id
                    _engineState.value = EngineState.Ready(option.id)
                }
            } catch (t: Throwable) {
                _engineState.value = EngineState.Failed(
                    t.message ?: "Failed to load ${option.displayName}"
                )
                null
            }
        }
    }

    fun clearTranscript() {
        synchronized(confirmedSegments) {
            confirmedSegments.clear()
        }
        _transcript.value = TranscriptUi(emptyList(), "")
    }

    fun transcriptText(): String {
        val confirmed = synchronized(confirmedSegments) { confirmedSegments.toList() }
        val pending = _transcript.value.pendingText
        return (confirmed + listOfNotNull(pending.ifBlank { null })).joinToString(" ")
    }

    fun saveTranscriptToDownloads() {
        val text = transcriptText()
        if (text.isBlank()) {
            _notice.value = "Nothing to save yet."
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, "ovio-transcript-$stamp.txt")
                    put(MediaStore.Downloads.MIME_TYPE, "text/plain")
                }
                val resolver = getApplication<Application>().contentResolver
                val uri: Uri? = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                if (uri == null) throw IllegalStateException("Could not create file")
                resolver.openOutputStream(uri)!!.use { stream ->
                    stream.write(text.toByteArray(Charsets.UTF_8))
                }
                _notice.value = "Saved to Downloads: ovio-transcript-$stamp.txt"
            } catch (t: Throwable) {
                _notice.value = "Save failed: ${t.message}"
            }
        }
    }

    fun consumeNotice() {
        _notice.value = null
    }

    private val listener = object : StreamingRecognizer.Listener {
        override fun onPartialTranscript(text: String) {
            _transcript.update { it.copy(pendingText = text) }
        }

        override fun onConfirmedTranscript(text: String) {
            val snapshot = synchronized(confirmedSegments) {
                confirmedSegments.add(text)
                confirmedSegments.toList()
            }
            _transcript.update { TranscriptUi(confirmedSegments = snapshot, pendingText = "") }
        }

        override fun onAmplitude(rms: Float) {
            _amplitudes.update { list ->
                (if (list.size >= BAR_COUNT) list.drop(1) else list) + rms
            }
        }

        override fun onError(message: String) {
            _notice.value = message
        }
    }

    override fun onCleared() {
        timerJob?.cancel()
        engine?.close()
        engine = null
        super.onCleared()
    }

    companion object {
        const val BAR_COUNT = 28
    }
}

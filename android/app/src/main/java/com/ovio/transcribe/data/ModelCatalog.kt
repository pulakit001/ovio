package com.ovio.transcribe.data

/**
 * Catalog of Parakeet models that can be downloaded in-app.
 *
 * Files are the int8 sherpa-onnx NeMo-transducer exports published by the
 * sherpa-onnx authors (mirrored on Hugging Face). Every file is fetched
 * individually so the UI can show real per-file progress.
 */
data class ModelOption(
    val id: String,
    val displayName: String,
    val languages: String,
    val subtitle: String,
    /** Base URL; file names are appended. Must end with '/'. */
    val baseUrl: String,
    /** Directory under filesDir/models/. */
    val directoryName: String,
    val fileNames: List<String>,
    val approximateSizeBytes: Long,
)

object ModelCatalog {

    const val MODEL_ROOT = "models"

    /** Tiny voice-activity model used to split speech into clean segments. */
    const val VAD_FILE_NAME = "silero_vad.onnx"
    const val VAD_URL =
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"
    const val VAD_SIZE_BYTES = 643_854L

    private val TRANSDUCER_FILES =
        listOf("encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt")

    val parakeetV2English = ModelOption(
        id = "parakeet-tdt-0.6b-v2",
        displayName = "Parakeet TDT 0.6B · v2",
        languages = "English",
        subtitle = "Fastest · punctuation & capitals · ≈482 MB",
        baseUrl = "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main/",
        directoryName = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8",
        fileNames = TRANSDUCER_FILES,
        approximateSizeBytes = 482_468_385L,
    )

    val parakeetV3Multi = ModelOption(
        id = "parakeet-tdt-0.6b-v3",
        displayName = "Parakeet TDT 0.6B · v3",
        languages = "English + 24 European languages",
        subtitle = "Multilingual · punctuation & capitals · ≈487 MB",
        baseUrl = "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/",
        directoryName = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
        fileNames = TRANSDUCER_FILES,
        approximateSizeBytes = 487_170_055L,
    )

    val parakeetOptions = listOf(parakeetV2English, parakeetV3Multi)
}

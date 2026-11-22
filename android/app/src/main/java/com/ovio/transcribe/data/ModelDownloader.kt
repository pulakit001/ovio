package com.ovio.transcribe.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** How far along a model download is. */
data class DownloadProgress(
    val optionId: String,
    val fileIndex: Int,
    val fileCount: Int,
    val currentFileName: String,
    val currentFileBytesDone: Long,
    val currentFileBytesTotal: Long,
    val error: String? = null,
) {
    /** 0f..1f across the whole model, null when unknown. */
    fun overallFraction(): Float? {
        val total = currentFileBytesTotal
        if (total <= 0) return null
        val step = currentFileBytesDone.coerceIn(0, total).toFloat() / total
        return (fileIndex + step) / fileCount
    }
}

/**
 * Downloads Parakeet model files (and Silero VAD) into filesDir/models/.
 * Plain HttpURLConnection + manual redirect follow, so there are no extra
 * network dependencies. Files land as `<name>.part` and are renamed when
 * complete, so an interrupted download never looks finished.
 */
class ModelDownloader(private val context: Context) {

    private fun modelsRoot(): File = File(context.filesDir, ModelCatalog.MODEL_ROOT)

    fun modelDir(option: ModelOption): File =
        File(modelsRoot(), option.directoryName)

    fun modelFile(option: ModelOption, fileName: String): File =
        File(modelDir(option), fileName)

    fun vadFile(): File = File(modelsRoot(), ModelCatalog.VAD_FILE_NAME)

    fun isModelComplete(option: ModelOption): Boolean =
        option.fileNames.all { modelFile(option, it).length() > 0 }

    fun isVadComplete(): Boolean = vadFile().length() > 0

    fun modelSizeBytes(option: ModelOption): Long =
        option.fileNames.sumOf { modelFile(option, it).length() }

    fun deleteModelDir(option: ModelOption): Boolean =
        modelDir(option).deleteRecursively()

    // ------------------------------------------------------------------ //

    suspend fun downloadOption(
        option: ModelOption,
        onProgress: (DownloadProgress) -> Unit,
    ): Result<File> = withContext(Dispatchers.IO) {
        runCatching {
            val dir = modelDir(option)
            dir.mkdirs()
            option.fileNames.forEachIndexed { index, fileName ->
                val target = modelFile(option, fileName)
                if (target.length() > 0) return@forEachIndexed // already there
                downloadToFile(
                    url = option.baseUrl + fileName,
                    target = target,
                ) { bytesDone, bytesTotal ->
                    onProgress(
                        DownloadProgress(
                            optionId = option.id,
                            fileIndex = index,
                            fileCount = option.fileNames.size,
                            currentFileName = fileName,
                            currentFileBytesDone = bytesDone,
                            currentFileBytesTotal = bytesTotal,
                        )
                    )
                }
            }
            dir
        }
    }

    suspend fun downloadVad(
        onProgress: (bytesDone: Long, bytesTotal: Long) -> Unit,
    ): Result<File> = withContext(Dispatchers.IO) {
        runCatching {
            val target = vadFile()
            modelsRoot().mkdirs()
            downloadToFile(ModelCatalog.VAD_URL, target, onProgress)
            target
        }
    }

    /** Downloads [url] into [target], streaming with progress. Follows redirects. */
    private fun downloadToFile(
        url: String,
        target: File,
        onProgress: (bytesDone: Long, bytesTotal: Long) -> Unit,
    ) {
        val part = File(target.absolutePath + ".part")
        part.outputStream().use { out ->
            var connection: HttpURLConnection? = null
            try {
                var current = url
                repeat(6) { attempt ->
                    val conn = open(current)
                    connection = conn
                    val code = conn.responseCode
                    if (code in 300..399) {
                        val location = conn.getHeaderField("Location")
                            ?: throw IOException("Redirect without Location (HTTP $code)")
                        current = resolveRedirect(current, location)
                        conn.disconnect()
                        return@repeat
                    }
                    if (code !in 200..299) {
                        throw IOException("HTTP $code while downloading ${url.substringBefore('?')}")
                    }

                    val total = conn.contentLengthLong
                    conn.inputStream.use { input ->
                        val buffer = ByteArray(1 shl 16)
                        var done = 0L
                        var lastEmit = 0L
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            out.write(buffer, 0, read)
                            done += read
                            if (done - lastEmit > 512_000 || lastEmit == 0L) {
                                lastEmit = done
                                onProgress(done, total)
                            }
                        }
                        if (total > 0 && done != total) {
                            throw IOException(
                                "Incomplete download ($done/$total bytes) for ${target.name}"
                            )
                        }
                    }
                    return
                }
                throw IOException("Too many redirects while downloading $url")
            } finally {
                connection?.disconnect()
            }
        }
        if (!part.renameTo(target)) {
            target.delete()
            if (!part.renameTo(target)) throw IOException("Could not finalize ${target.name}")
        }
    }

    private fun open(url: String): HttpURLConnection {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.instanceFollowRedirects = false // follow manually (HTTP -> CDN hops)
        conn.requestMethod = "GET"
        conn.setRequestProperty("Accept-Encoding", "identity")
        conn.setRequestProperty("User-Agent", "ovio-transcribe/1.0 (Android)")
        conn.connectTimeout = 20_000
        conn.readTimeout = 60_000
        return conn
    }

    private fun resolveRedirect(base: String, location: String): String {
        if (location.startsWith("http://") || location.startsWith("https://")) return location
        return URL(URL(base), location).toString()
    }
}

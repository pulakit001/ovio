package com.ovio.transcribe.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Radar
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.ovio.transcribe.MainViewModel
import com.ovio.transcribe.DownloadUi
import com.ovio.transcribe.ModelStatus
import androidx.compose.material3.HorizontalDivider
import java.util.Locale

@Composable
fun SetupScreen(
    vm: MainViewModel,
    onStartTranscribing: () -> Unit,
) {
    val statuses by vm.modelStatuses.collectAsState()
    val vadReady by vm.vadReady.collectAsState()
    val selected by vm.selectedModelId.collectAsState()
    val download by vm.download.collectAsState()

    val anyDownloading = download != null
    val selectedReady = statuses
        .firstOrNull { it.option.id == selected }
        ?.downloaded == true
    val canStart = selectedReady && vadReady

    Column(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Outlined.Mic,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(26.dp),
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = "Ovio Transcribe",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Spacer(Modifier.height(14.dp))
            Text(
                text = "Parakeet, running entirely on your phone",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Download a NVIDIA Parakeet model once — after that, real-time " +
                    "transcription works with no internet at all. Audio never leaves " +
                    "your device.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(statuses, key = { it.option.id }) { status ->
                ModelCard(
                    status = status,
                    selected = selected == status.option.id,
                    anyDownloading = anyDownloading,
                    downloadUi = download?.takeIf { it.optionId == status.option.id },
                    onSelect = { vm.selectModel(status.option.id) },
                    onDownload = { vm.downloadModel(status.option) },
                    onDelete = { vm.deleteModel(status.option) },
                )
            }

            item {
                VadCard(ready = vadReady, busy = anyDownloading && !vadReady)
            }

            item {
                Text(
                    text = "Models: NVIDIA Parakeet TDT transducers exported to ONNX and run " +
                        "through sherpa-onnx (int8, ~0.6B parameters). Downloads come from " +
                        "Hugging Face; transcription itself is 100% offline.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Column(modifier = Modifier.padding(horizontal = 20.dp)) {
            Button(
                onClick = onStartTranscribing,
                enabled = canStart,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
            ) {
                Text(
                    if (canStart) "Start transcribing"
                    else "Download a model to get started",
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            Spacer(Modifier.height(18.dp))
        }
    }
}

@Composable
private fun ModelCard(
    status: ModelStatus,
    selected: Boolean,
    anyDownloading: Boolean,
    downloadUi: DownloadUi?,
    onSelect: () -> Unit,
    onDownload: () -> Unit,
    onDelete: () -> Unit,
) {
    val option = status.option
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Outlined.Language,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = option.displayName,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                    color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                    else MaterialTheme.colorScheme.onSurface,
                )
                if (status.downloaded) {
                    Icon(
                        imageVector = Icons.Outlined.CheckCircle,
                        contentDescription = "Downloaded",
                        tint = MaterialTheme.colorScheme.secondary,
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = option.languages,
                style = MaterialTheme.typography.bodyMedium,
                color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = option.subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                else MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (status.downloaded) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "On device · ${formatBytes(status.sizeBytes)} · ready",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary,
                )
            } else {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = option.fileNames.joinToString(" · ") { it.replace(".int8", "") },
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.outline,
                )
                Text(
                    text = "Not downloaded · ≈${formatBytes(option.approximateSizeBytes)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(10.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
            Spacer(Modifier.height(10.dp))

            when {
                // This model is downloading right now.
                downloadUi != null && downloadUi.error == null -> {
                    val fraction = downloadUi.fraction
                    if (fraction != null) {
                        LinearProgressIndicator(
                            progress = { fraction },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "${downloadUi.label} · ${(fraction * 100).toInt()}%",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                text = downloadUi.label.ifBlank { "Preparing download…" },
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                    Text(
                        text = "Keep the app open while downloading (Wi-Fi recommended).",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }

                // Failed download: show error + retry.
                downloadUi != null && downloadUi.error != null -> {
                    Text(
                        text = downloadUi.error,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    TextButton(onClick = onDownload) { Text("Retry") }
                }

                // Ready: select / remove.
                status.downloaded -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (selected) {
                            Text(
                                "Selected",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.secondary,
                            )
                        } else {
                            TextButton(onClick = onSelect) { Text("Use this model") }
                        }
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = onDelete) {
                            Text(
                                "Remove",
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }

                // Not downloaded: offer download (disabled while another runs).
                else -> {
                    Button(
                        onClick = onDownload,
                        enabled = !anyDownloading,
                    ) {
                        Text("Download (${formatBytes(option.approximateSizeBytes)})")
                    }
                    if (anyDownloading) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "Finish the current download first.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun VadCard(ready: Boolean, busy: Boolean) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Outlined.Radar,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(22.dp),
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(text = "Silero VAD", style = MaterialTheme.typography.titleSmall)
                Text(
                    text = "644 KB voice-activity model that splits speech into clean " +
                        "segments. Comes with your first model download.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            when {
                ready -> Icon(
                    imageVector = Icons.Outlined.CheckCircle,
                    contentDescription = "Ready",
                    tint = MaterialTheme.colorScheme.secondary,
                )
                busy -> CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                )
                else -> Text(
                    text = "Missing",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun formatBytes(bytes: Long): String =
    String.format(Locale.US, "%.0f MB", bytes / 1_048_576.0)

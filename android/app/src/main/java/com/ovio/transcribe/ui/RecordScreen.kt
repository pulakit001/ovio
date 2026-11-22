package com.ovio.transcribe.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.ovio.transcribe.EngineState
import com.ovio.transcribe.MainViewModel
import com.ovio.transcribe.asr.StreamingRecognizer
import java.util.Locale

@Composable
fun RecordScreen(
    vm: MainViewModel,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val clip = LocalClipboardManager.current

    val recording by vm.recording.collectAsState()
    val transcript by vm.transcript.collectAsState()
    val amplitudes by vm.amplitudes.collectAsState()
    val engineState by vm.engineState.collectAsState()
    val elapsed by vm.elapsedSeconds.collectAsState()
    val selectedModel by vm.selectedModelId.collectAsState()

    var micGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        micGranted = granted
        if (granted) vm.toggleRecording(true)
    }

    val scrollState = rememberScrollState()

    // Auto-scroll the transcript as new text arrives.
    LaunchedEffect(transcript.confirmedSegments.size, transcript.pendingText) {
        scrollState.animateScrollTo(scrollState.maxValue)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
    ) {
        // ------------------------------------------------------------------
        // Top bar
        // ------------------------------------------------------------------
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 6.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = {
                    if (recording) vm.toggleRecording(micGranted)
                    onBack()
                },
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Parakeet · ${selectedModel ?: "no model"}",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    text = when (engineState) {
                        is EngineState.Ready -> if (recording) "Recording · running fully offline"
                        else "Model loaded · tap the mic"
                        is EngineState.Loading -> "Loading model (first time takes a while)…"
                        is EngineState.Failed -> "Model failed — pick it again in Setup"
                        else -> "Preparing…"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(
                onClick = { vm.transcriptText().takeIf { it.isNotBlank() }?.let { clip.setText(AnnotatedString(it)) } },
                enabled = transcript.confirmedSegments.isNotEmpty() || transcript.pendingText.isNotBlank(),
            ) {
                Icon(Icons.Outlined.ContentCopy, contentDescription = "Copy transcript")
            }
            IconButton(onClick = { vm.saveTranscriptToDownloads() }) {
                Icon(Icons.Outlined.Save, contentDescription = "Save transcript")
            }
            IconButton(
                onClick = { vm.clearTranscript() },
                enabled = transcript.confirmedSegments.isNotEmpty() || transcript.pendingText.isNotBlank(),
            ) {
                Icon(Icons.Outlined.Delete, contentDescription = "Clear transcript")
            }
        }

        if (engineState is EngineState.Loading) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    "Loading Parakeet into memory…",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // ------------------------------------------------------------------
        // Waveform
        // ------------------------------------------------------------------
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(120.dp),
            contentAlignment = Alignment.Center,
        ) {
            Waveform(
                amplitudes = amplitudes,
                recording = recording,
            )
        }

        // ------------------------------------------------------------------
        // Transcript
        // ------------------------------------------------------------------
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(scrollState)
                .padding(horizontal = 24.dp),
        ) {
            Spacer(Modifier.height(8.dp))

            if (transcript.confirmedSegments.isEmpty() && transcript.pendingText.isBlank()) {
                Text(
                    text = if (recording) "Listening… say anything and it will appear here."
                    else "Transcription appears here. Everything is processed on this " +
                        "device — no audio is uploaded.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .fillMaxWidth()
                        .alpha(if (recording) 1f else 0.75f),
                )
            } else {
                transcript.confirmedSegments.forEachIndexed { index, segment ->
                    Text(
                        text = segment,
                        style = MaterialTheme.typography.bodyLarge.copy(
                            fontWeight = FontWeight.SemiBold,
                        ),
                        color = MaterialTheme.colorScheme.onBackground,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                }
                if (transcript.pendingText.isNotBlank()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = transcript.pendingText,
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontStyle = FontStyle.Italic,
                                fontWeight = FontWeight.Light,
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                        PulsingDot()
                    }
                }
            }

            Spacer(Modifier.height(20.dp))
        }

        // ------------------------------------------------------------------
        // Bottom bar: timer + mic button
        // ------------------------------------------------------------------
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .height(140.dp),
        ) {
            Text(
                text = formatTimer(elapsed),
                style = MaterialTheme.typography.headlineSmall.copy(
                    fontFamily = FontFamily.Monospace,
                ),
                color = if (recording) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .padding(start = 28.dp),
            )

            MicButton(
                recording = recording,
                enabled = !micDenied(micGranted, context) && engineState !is EngineState.Loading,
                modifier = Modifier.align(Alignment.Center),
                onClick = {
                    if (!micGranted) {
                        permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    } else {
                        vm.toggleRecording(true)
                    }
                },
            )
        }
    }

    // ------------------------------------------------------------------
    // Permission overlay
    // ------------------------------------------------------------------
    if (!micGranted) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background.copy(alpha = 0.92f)),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(32.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.Mic,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(56.dp),
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    "Microphone access needed",
                    style = MaterialTheme.typography.headlineSmall,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "The Parakeet model listens to your voice and writes the text — " +
                        "all on this phone. Record permission is required for that.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(20.dp))
                Button(onClick = { permissionLauncher.launch(Manifest.permission.RECORD_AUDIO) }) {
                    Text("Allow microphone")
                }
                Spacer(Modifier.height(8.dp))
                TextButton(
                    onClick = {
                        context.startActivity(
                            Intent(
                                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.fromParts("package", context.packageName, null),
                            )
                        )
                    },
                ) { Text("Open app settings") }
            }
        }
    }
}

@Composable
private fun Waveform(amplitudes: List<Float>, recording: Boolean) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val count = MainViewModel.BAR_COUNT
        for (i in 0 until count) {
            val raw = amplitudes.getOrNull(i) ?: 0f
            val level = (raw / 0.09f).coerceIn(0f, 1f)
            val height = (4 + 68 * level).dp
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(height)
                    .clip(RoundedCornerShape(3.dp))
                    .background(
                        if (recording) MaterialTheme.colorScheme.primary.copy(
                            alpha = 0.35f + 0.65f * level
                        ) else MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)
                    ),
            )
        }
    }
}

@Composable
private fun MicButton(
    recording: Boolean,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulse by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.07f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 750),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulseScale",
    )
    val scale = if (recording) pulse else 1f

    FilledIconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .size(96.dp)
            .scale(scale),
        colors = IconButtonDefaults.filledIconButtonColors(
            containerColor = if (recording) MaterialTheme.colorScheme.secondary
            else MaterialTheme.colorScheme.primary,
            contentColor = if (recording) MaterialTheme.colorScheme.onSecondary
            else MaterialTheme.colorScheme.onPrimary,
        ),
    ) {
        Icon(
            imageVector = if (recording) Icons.Filled.Stop else Icons.Filled.Mic,
            contentDescription = if (recording) "Stop" else "Record",
            modifier = Modifier.size(40.dp),
        )
    }
}

@Composable
private fun PulsingDot() {
    val infiniteTransition = rememberInfiniteTransition(label = "dot")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.25f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 650),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "dotAlpha",
    )
    Box(
        modifier = Modifier
            .padding(start = 8.dp)
            .size(8.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(MaterialTheme.colorScheme.primary.copy(alpha = alpha)),
    )
}

private fun formatTimer(seconds: Long): String {
    val m = seconds / 60
    val s = seconds % 60
    return String.format(Locale.US, "%02d:%02d", m, s)
}

private fun micDenied(granted: Boolean, context: Context): Boolean = !granted

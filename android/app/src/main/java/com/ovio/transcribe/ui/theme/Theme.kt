package com.ovio.transcribe.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DeepInk = Color(0xFF33526E)
private val MistBlue = Color(0xFFA8C7EA)
private val Aqua = Color(0xFF3D8B94)
private val Sand = Color(0xFFF6F2EA)

val LightColors: ColorScheme = lightColorScheme(
    primary = DeepInk,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD4E4F5),
    onPrimaryContainer = Color(0xFF0D2438),
    secondary = Aqua,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD0EBEA),
    onSecondaryContainer = Color(0xFF051F21),
    background = Color(0xFFFAFBFE),
    onBackground = Color(0xFF171C22),
    surface = Color(0xFFFAFBFE),
    onSurface = Color(0xFF171C22),
    surfaceVariant = Color(0xFFDFE2EB),
    onSurfaceVariant = Color(0xFF42474E),
    outline = Color(0xFF73777F),
)

val DarkColors: ColorScheme = darkColorScheme(
    primary = MistBlue,
    onPrimary = Color(0xFF0B314A),
    primaryContainer = Color(0xFF1E4160),
    onPrimaryContainer = Color(0xFFD0E3F8),
    secondary = Color(0xFF86CFCE),
    onSecondary = Color(0xFF003736),
    background = Color(0xFF101317),
    onBackground = Color(0xFFE2E2E7),
    surface = Color(0xFF101317),
    onSurface = Color(0xFFE2E2E7),
    surfaceVariant = Color(0xFF42474E),
    onSurfaceVariant = Color(0xFFC3C7CF),
)

@Composable
fun OvioColorScheme(): ColorScheme =
    if (isSystemInDarkTheme()) DarkColors else LightColors

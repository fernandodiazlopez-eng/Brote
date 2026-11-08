/**
 * inject-manifest.mjs
 * Inyecta automáticamente los permisos de Salud (Health Connect / Podómetro),
 * audio privado y el puente nativo de detección de música (Spotify / reproductores)
 * en AndroidManifest.xml y MainActivity durante GitHub Actions.
 */

import fs from 'node:fs';
import path from 'node:path';

// --- 1. ACTUALIZAR ANDROIDMANIFEST.XML ---
const manifestPath = path.resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml');

console.log('🔍 [inject-manifest] Buscando AndroidManifest.xml en:', manifestPath);

if (!fs.existsSync(manifestPath)) {
  console.error(`❌ [inject-manifest] No se encontró el archivo: ${manifestPath}`);
  console.error('Asegúrate de ejecutar "npx cap add android" o "npx cap sync android" antes de este script.');
  process.exit(1);
}

let content = fs.readFileSync(manifestPath, 'utf8');

const permissions = [
  '    <uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />',
  '    <uses-permission android:name="android.permission.BODY_SENSORS" />',
  '    <uses-permission android:name="android.permission.health.READ_STEPS" />',
  '    <uses-permission android:name="android.permission.health.READ_TOTAL_CALORIES_BURNED" />',
  '    <uses-permission android:name="android.permission.health.READ_DISTANCE" />',
  '    <uses-permission android:name="android.permission.VIBRATE" />',
  '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
  '    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />',
  '    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />',
];

const missingPermissions = permissions.filter((perm) => {
  const match = perm.match(/android:name="([^"]+)"/);
  return match ? !content.includes(match[1]) : false;
});

if (missingPermissions.length > 0) {
  const permissionsBlock = `\n    <!-- Permisos inyectados para Salud (Health Connect) y Audio Privado -->\n${missingPermissions.join('\n')}\n`;
  content = content.replace(/(<application[\s\S]*?>)/, `${permissionsBlock}\n$1`);
  console.log(`✅ Inyectados ${missingPermissions.length} permisos en AndroidManifest.xml`);
} else {
  console.log('ℹ️ Los permisos ya estaban presentes en el archivo.');
}

if (!content.includes('com.google.android.apps.healthdata')) {
  const queriesBlock = `
    <!-- Necesario para visibilidad de Google Health Connect en Android 11+ -->
    <queries>
        <package android:name="com.google.android.apps.healthdata" />
        <intent>
            <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
        </intent>
    </queries>
`;
  content = content.replace(/(<application[\s\S]*?>)/, `${queriesBlock}\n$1`);
  console.log('✅ Inyectado bloque <queries> para Google Health Connect.');
} else {
  console.log('ℹ️ El bloque <queries> ya estaba presente.');
}

if (!content.includes('androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE')) {
  const activityAliasBlock = `
        <!-- Requisito obligatorio de Health Connect para mostrar permisos -->
        <activity-alias
            android:name="ViewPermissionUsageActivity"
            android:exported="true"
            android:targetActivity=".MainActivity"
            android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
            <intent-filter>
                <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
            </intent-filter>
        </activity-alias>
    </application>`;
  content = content.replace(/<\/application>/, activityAliasBlock);
  console.log('✅ Inyectado <activity-alias> de permisos de Health Connect dentro de <application>.');
} else {
  console.log('ℹ️ El <activity-alias> ya estaba configurado.');
}

fs.writeFileSync(manifestPath, content, 'utf8');
console.log('🎉 [inject-manifest] AndroidManifest.xml actualizado con éxito.');

// --- 2. INYECTAR DETECCIÓN DE MÚSICA (SPOTIFY/AUDIO) EN MAINACTIVITY ---
function findMainActivity(dir) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const res = findMainActivity(full);
      if (res) return res;
    } else if (entry.name === 'MainActivity.java' || entry.name === 'MainActivity.kt') {
      return full;
    }
  }
  return null;
}

const javaDir = path.resolve(process.cwd(), 'android/app/src/main/java');
const mainActivityPath = findMainActivity(javaDir);

if (mainActivityPath) {
  console.log('🔍 [inject-manifest] MainActivity encontrada en:', mainActivityPath);
  let mainCode = fs.readFileSync(mainActivityPath, 'utf8');

  if (!mainCode.includes('AndroidBridge')) {
    const isKotlin = mainActivityPath.endsWith('.kt');

    if (isKotlin) {
      // Kotlin
      const imports = `import android.os.Bundle\nimport android.content.Context\nimport android.media.AudioManager\nimport android.webkit.JavascriptInterface\n`;
      const injection = `
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            bridge?.webView?.addJavascriptInterface(object : Any() {
                @JavascriptInterface
                fun isMusicPlaying(): Boolean {
                    return audioManager?.isMusicActive == true
                }
            }, "AndroidBridge")
        } catch (_: Exception) {}
    }
`;
      mainCode = mainCode.replace(/(package\s+[^;\n]+[;\n])/, `$1\n${imports}`);
      mainCode = mainCode.replace(/(class\s+MainActivity[^{]*\{)/, `$1\n${injection}`);
    } else {
      // Java
      const imports = `import android.os.Bundle;\nimport android.content.Context;\nimport android.media.AudioManager;\nimport android.webkit.JavascriptInterface;\n`;
      const injection = `
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            final AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public boolean isMusicPlaying() {
                        return audioManager != null && audioManager.isMusicActive();
                    }
                }, "AndroidBridge");
            }
        } catch (Exception ignored) {}
    }
`;
      mainCode = mainCode.replace(/(package\s+[^;\n]+;)/, `$1\n${imports}`);
      mainCode = mainCode.replace(/(public\s+class\s+MainActivity[^{]*\{)/, `$1\n${injection}`);
    }

    fs.writeFileSync(mainActivityPath, mainCode, 'utf8');
    console.log('🎵 [inject-manifest] Detección nativa de música (Spotify/Media) inyectada en MainActivity.');
  } else {
    console.log('ℹ️ MainActivity ya incluía el puente AndroidBridge.');
  }
} else {
  console.log('⚠️ No se encontró MainActivity en android/app/src/main/java (se inyectará en la siguiente ejecución).');
}

console.log('🚀 [inject-manifest] Proceso completado.');

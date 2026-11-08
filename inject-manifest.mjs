/**
 * inject-manifest.js
 * Inyecta automáticamente los permisos de Salud (Health Connect / Podómetro)
 * y configuraciones de audio privado en AndroidManifest.xml durante GitHub Actions.
 */

import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml');

console.log('🔍 [inject-manifest] Buscando AndroidManifest.xml en:', manifestPath);

if (!fs.existsSync(manifestPath)) {
  console.error(`❌ [inject-manifest] No se encontró el archivo: ${manifestPath}`);
  console.error('Asegúrate de ejecutar "npx cap add android" o "npx cap sync android" antes de este script.');
  process.exit(1);
}

let content = fs.readFileSync(manifestPath, 'utf8');

// 1. Permisos requeridos
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

// Filtrar los que no estén ya presentes para evitar duplicados
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

// 2. Bloque <queries> para Google Health Connect
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

// 3. Bloque <activity-alias> para Rationale de Health Connect (requisito de Google Play)
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
console.log('🎉 [inject-manifest] AndroidManifest.xml actualizado con éxito para la compilación.');

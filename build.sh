#!/bin/bash
set -e

echo "=== Bee Queen Professional Zero-Action Build Pipeline ==="

# Set JDK path explicitly to the bundled one from the previous workspace
export JAVA_HOME="/home/hamza/Desktop/bee queen app/jdk-21.0.6+7"
export PATH="$JAVA_HOME/bin:$PATH"

echo "1. Checking Java Version..."
java -version

echo "2. Building Vite React App..."
npm run build

echo "3. Capacitor Sync..."
# Ensure android platform exists
if [ ! -d "android" ]; then
    echo "Android platform missing. Adding it now..."
    npx cap add android
fi
npx cap sync android

echo "4. Fixing Android Manifest permissions..."
# Inject MANAGE_EXTERNAL_STORAGE and other permissions for SyncEngine
MANIFEST_FILE="android/app/src/main/AndroidManifest.xml"
if grep -q "MANAGE_EXTERNAL_STORAGE" "$MANIFEST_FILE"; then
    echo "Permissions already injected."
else
    echo "Injecting permissions into AndroidManifest.xml..."
    # A bit crude but effective: insert permissions before <application>
    sed -i '/<application/i \
    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />\
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />\
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />\
    <uses-permission android:name="android.permission.CAMERA" />' "$MANIFEST_FILE"
fi

echo "5. Building APK with Gradle..."
cd android
./gradlew assembleDebug --no-daemon
cd ..

APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
DEST_PATH="$HOME/Desktop/BeeQueen_Professional.apk"

if [ -f "$APK_PATH" ]; then
    echo "6. Moving APK to Desktop..."
    cp "$APK_PATH" "$DEST_PATH"
    echo "✅ Success! APK saved to: $DEST_PATH"
else
    echo "❌ Error: APK not found at $APK_PATH"
    exit 1
fi

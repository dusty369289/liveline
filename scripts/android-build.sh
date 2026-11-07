#!/usr/bin/env bash
# Build the Android app locally: web build, Capacitor sync, Gradle. Usage: scripts/android-build.sh [debug|release]
# Needs JDK 21 and the Android SDK. Defaults suit this machine (Homebrew openjdk@21, ~/Android/Sdk); override with
# JAVA_HOME / ANDROID_HOME. Release signing reads android/keystore.properties (never committed) if present.
set -euo pipefail
cd "$(dirname "$0")/.."
kind="${1:-debug}"
export JAVA_HOME="${JAVA_HOME:-/home/linuxbrew/.linuxbrew/opt/openjdk@21/libexec}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npm run build
npx cap sync android
cd android
if [ "$kind" = release ]; then ./gradlew --no-daemon assembleRelease; else ./gradlew --no-daemon assembleDebug; fi
ls -la "app/build/outputs/apk/$kind/"

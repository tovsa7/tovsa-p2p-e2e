#!/bin/bash
set -e

OWNER="${GITHUB_REPOSITORY_OWNER}"
REPO_NAME="${GITHUB_REPOSITORY##*/}"
PAGES_URL="https://${OWNER}.github.io/${REPO_NAME}"
WS="${GITHUB_WORKSPACE}"
PKG="com.tovsa.app"
PKG_PATH="com/tovsa/app"

echo "Building TWA APK for ${PAGES_URL}"

# Принимаем лицензии SDK
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
  "build-tools;34.0.0" "platforms;android-34" 2>/dev/null || true

mkdir -p twa-project && cd twa-project

# settings.gradle
printf 'rootProject.name = "tovsa"\ninclude ":app"\n' > settings.gradle

# gradle.properties
printf 'android.useAndroidX=true\nandroid.enableJetifier=true\norg.gradle.jvmargs=-Xmx2g\n' > gradle.properties

# build.gradle (project)
cat > build.gradle << 'EOF'
buildscript {
    repositories { google(); mavenCentral() }
    dependencies { classpath 'com.android.tools.build:gradle:8.2.2' }
}
allprojects { repositories { google(); mavenCentral() } }
EOF

# gradle wrapper
mkdir -p gradle/wrapper

# gradle-wrapper.jar — нужен для запуска gradlew
curl -fsSL 'https://github.com/gradle/gradle/raw/v8.2.0/gradle/wrapper/gradle-wrapper.jar' \
  -o gradle/wrapper/gradle-wrapper.jar

printf 'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.2-bin.zip\ndistributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\n' \
  > gradle/wrapper/gradle-wrapper.properties

curl -fsSL https://raw.githubusercontent.com/gradle/gradle/v8.2.0/gradlew -o gradlew
chmod +x gradlew

# app dirs
mkdir -p app/src/main/java/${PKG_PATH}
mkdir -p app/src/main/res/values
mkdir -p app/src/main/res/mipmap-xxxhdpi

# app/build.gradle
cat > app/build.gradle << EOF
apply plugin: 'com.android.application'
android {
    namespace '${PKG}'
    compileSdk 34
    defaultConfig {
        applicationId '${PKG}'
        minSdk 21
        targetSdk 34
        versionCode ${VERSION_CODE}
        versionName '${VERSION}'
    }
    signingConfigs {
        release {
            storeFile file('${WS}/tovsa.keystore')
            storePassword 'tovsa-store-pass'
            keyAlias 'tovsa'
            keyPassword 'tovsa-key-pass'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
}
dependencies {
    implementation 'androidx.browser:browser:1.8.0'
    implementation 'com.google.androidbrowserhelper:androidbrowserhelper:2.5.0'
}
EOF

# AndroidManifest.xml
cat > app/src/main/AndroidManifest.xml << EOF
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>
    <application
        android:label="Tovsa"
        android:icon="@mipmap/ic_launcher"
        android:theme="@style/Theme.AppCompat.Light.NoActionBar">
        <activity
            android:name=".LaunchActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
            <!-- TWA: URL и цвета без браузерного UI -->
            <meta-data android:name="android.support.customtabs.trusted.DEFAULT_URL"
                android:value="${PAGES_URL}/" />
            <meta-data android:name="android.support.customtabs.trusted.STATUS_BAR_COLOR"
                android:value="#0a0a0f" />
            <meta-data android:name="android.support.customtabs.trusted.NAVIGATION_BAR_COLOR"
                android:value="#0a0a0f" />
        </activity>
    </application>
</manifest>
EOF

# Drawable splash
mkdir -p app/src/main/res/drawable
cat > app/src/main/res/drawable/splash.xml << 'SPLASHEOF'
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#111118"/>
</shape>
SPLASHEOF


# LaunchActivity.java
cat > app/src/main/java/${PKG_PATH}/LaunchActivity.java << EOF
package ${PKG};
import android.net.Uri;
import android.os.Bundle;
import com.google.androidbrowserhelper.trusted.TwaLauncher;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

// LauncherActivity из androidbrowserhelper — настоящий TWA без браузерного UI
public class LaunchActivity extends LauncherActivity {
    // LauncherActivity читает параметры из AndroidManifest meta-data
}
EOF

# styles.xml
cat > app/src/main/res/values/styles.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.AppCompat.Light.NoActionBar"/>
</resources>
EOF

# Иконка
cp "${WS}/icon-192.png" app/src/main/res/mipmap-xxxhdpi/ic_launcher.png 2>/dev/null || true

# Собираем
./gradlew assembleRelease --no-daemon -x test 2>&1 | tail -50
echo "APK built at: $(find . -name '*.apk' | head -1)"

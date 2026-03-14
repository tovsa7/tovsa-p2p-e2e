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
            storePassword '${KEYSTORE_PASS}'
            keyAlias '${KEY_ALIAS}'
            keyPassword '${KEY_PASS}'
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
    implementation 'androidx.browser:browser:1.7.0'
    implementation 'androidx.appcompat:appcompat:1.6.1'
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
        </activity>
    </application>
</manifest>
EOF

# LaunchActivity.java
cat > app/src/main/java/${PKG_PATH}/LaunchActivity.java << EOF
package ${PKG};
import android.net.Uri;
import android.os.Bundle;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.appcompat.app.AppCompatActivity;
public class LaunchActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        new CustomTabsIntent.Builder().build()
            .launchUrl(this, Uri.parse("${PAGES_URL}/"));
        finish();
    }
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

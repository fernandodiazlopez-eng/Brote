plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.upgrade.fitness"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.upgrade.fitness"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")

    // Health Connect Client (Google Health Platform)
    implementation("androidx.health.connect:connect-client:1.1.0-alpha11")

    // Corrutinas para operaciones asíncronas de salud
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // WebView Jetpack Integration
    implementation("androidx.webkit:webkit:1.12.1")
}

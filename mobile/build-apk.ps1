# Builds, signs, and verifies the standalone Hikasha Chat Android APK.
#
# Requirements:
#   - JDK 21 (JAVA_HOME, or the local AndroidBuild install)
#   - Android SDK 36 + build-tools 36 (ANDROID_HOME, or %LOCALAPPDATA%\Android\Sdk)
#   - mobile/keystore/hikasha-release.jks and mobile/keystore.properties
#
# The keystore is the app's update identity. Back it up; losing it means a
# future APK cannot install over this one without uninstalling first.
$ErrorActionPreference = 'Stop'

$mobile = Split-Path -Parent $PSCommandPath
$root = Split-Path -Parent $mobile
$release = Join-Path $root 'release'
$propsFile = Join-Path $mobile 'keystore.properties'
$keystore = Join-Path $mobile 'keystore\hikasha-release.jks'

function Find-Jdk {
    if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
        return $env:JAVA_HOME
    }
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\AndroidBuild'),
        (Join-Path $env:ProgramFiles 'Eclipse Adoptium'),
        (Join-Path ${env:ProgramFiles(x86)} 'Eclipse Adoptium')
    )
    foreach ($base in $candidates) {
        if (-not (Test-Path -LiteralPath $base)) { continue }
        $jdk = Get-ChildItem -LiteralPath $base -Directory -Filter 'jdk-*' -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($jdk) { return $jdk.FullName }
    }
    throw 'JDK 21 not found. Set JAVA_HOME and re-run.'
}

function Find-Sdk {
    foreach ($candidate in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))) {
        if ($candidate -and (Test-Path (Join-Path $candidate 'platforms\android-36'))) {
            return $candidate
        }
    }
    throw 'Android SDK 36 not found. Set ANDROID_HOME and re-run.'
}

$jdk = Find-Jdk
$sdk = Find-Sdk
$buildTools = Get-ChildItem -LiteralPath (Join-Path $sdk 'build-tools') -Directory |
    Sort-Object Name -Descending | Select-Object -First 1
if (-not $buildTools) { throw 'Android build-tools not installed.' }
$apksignerJar = Join-Path $buildTools.FullName 'lib\apksigner.jar'
$zipalign = Join-Path $buildTools.FullName 'zipalign.exe'
if (-not (Test-Path $apksignerJar) -or -not (Test-Path $zipalign)) {
    throw 'zipalign/apksigner missing from build-tools.'
}
if (-not (Test-Path $propsFile) -or -not (Test-Path $keystore)) {
    throw 'Release signing material missing: mobile/keystore/hikasha-release.jks + mobile/keystore.properties.'
}

$version = (Get-Content (Join-Path $mobile 'package.json') -Raw | ConvertFrom-Json).version
$props = Get-Content -LiteralPath $propsFile
$storePass = ($props | Where-Object { $_ -like 'storePassword=*' } | ForEach-Object { $_.Substring(14) })
$keyPass = ($props | Where-Object { $_ -like 'keyPassword=*' } | ForEach-Object { $_.Substring(12) })
if (-not $storePass -or -not $keyPass) { throw 'keystore.properties is incomplete.' }

$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = (Join-Path $jdk 'bin') + ';' + (Join-Path $sdk 'platform-tools') + ';' + $env:Path

Push-Location $mobile
try {
    if (Test-Path (Join-Path $mobile 'package-lock.json')) {
        & npm.cmd ci --no-audit --no-fund --loglevel=error
    } else {
        & npm.cmd install --no-audit --no-fund --loglevel=error
    }
    if ($LASTEXITCODE -ne 0) { throw 'mobile npm install failed.' }
    & (Join-Path $mobile 'node_modules\.bin\cap.cmd') sync android
    if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
}
finally {
    Pop-Location
}

Push-Location (Join-Path $mobile 'android')
try {
    & '.\gradlew.bat' assembleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) { throw 'Gradle assembleRelease failed.' }
}
finally {
    Pop-Location
}

$unsigned = Join-Path $mobile 'android\app\build\outputs\apk\release\app-release-unsigned.apk'
if (-not (Test-Path -LiteralPath $unsigned)) { throw 'Unsigned release APK was not produced.' }
New-Item -ItemType Directory -Force -Path $release | Out-Null
$aligned = Join-Path $env:TEMP 'hikasha-chat-aligned.apk'
$apk = Join-Path $release ("Hikasha-Chat-{0}.apk" -f $version)

& $zipalign -p -f 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed.' }
& (Join-Path $jdk 'bin\java.exe') -jar $apksignerJar sign `
    --ks $keystore --ks-key-alias hikasha `
    --ks-pass ("pass:" + $storePass) --key-pass ("pass:" + $keyPass) `
    --v2-signing-enabled true --v3-signing-enabled true `
    --in $aligned --out $apk
if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
Remove-Item -LiteralPath $aligned -Force -ErrorAction SilentlyContinue

& (Join-Path $jdk 'bin\java.exe') -jar $apksignerJar verify --verbose --print-certs $apk
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
Remove-Item -LiteralPath ($apk + '.idsig') -Force -ErrorAction SilentlyContinue

$hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $(Split-Path $apk -Leaf)" | Set-Content -LiteralPath ($apk + '.sha256') -Encoding ASCII
Write-Output "APK: $apk"
Write-Output "SHA256: $hash"

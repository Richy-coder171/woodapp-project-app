$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$capacitorGradle = Join-Path $projectRoot 'woodapp-react\android\app\capacitor.build.gradle'

if (-not (Test-Path -LiteralPath $capacitorGradle)) {
  throw "Missing generated Capacitor Gradle file: $capacitorGradle"
}

$content = Get-Content -Raw -LiteralPath $capacitorGradle
$content = $content.Replace('JavaVersion.VERSION_21', 'JavaVersion.VERSION_17')
[System.IO.File]::WriteAllText($capacitorGradle, $content, [System.Text.UTF8Encoding]::new($false))

Write-Host "Android Java compatibility set to Java 17 in $capacitorGradle"

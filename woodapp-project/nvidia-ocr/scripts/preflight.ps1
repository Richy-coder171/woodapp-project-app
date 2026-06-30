$ErrorActionPreference = "Continue"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Report = Join-Path $Root "PREFLIGHT_REPORT.md"

function Run-Check($Name, $Command, $Arguments = @()) {
  $result = [ordered]@{ name = $Name; status = "FAILED"; output = ""; exitCode = $null }
  try {
    $output = & $Command @Arguments 2>&1
    $result.exitCode = $LASTEXITCODE
    $result.output = ($output | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) { $result.status = "OK" }
  } catch {
    $result.output = $_.Exception.Message
  }
  return $result
}

function Run-Skipped($Name, $Reason) {
  return [ordered]@{ name = $Name; status = "SKIPPED"; output = $Reason; exitCode = $null }
}

$checks = @()
$checks += Run-Check "nvidia-smi" "nvidia-smi"
$checks += Run-Check "wsl status" "wsl" @("--status")
$checks += Run-Check "wsl list verbose" "wsl" @("--list", "--verbose")
$checks += Run-Check "docker version" "docker" @("version")
$checks += Run-Check "docker info" "docker" @("info")
$checks += Run-Check "system memory" "powershell" @("-NoProfile", "-Command", "try { [math]::Round((Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).TotalPhysicalMemory / 1GB, 2) } catch { Write-Error $_.Exception.Message; exit 1 }")
$checks += Run-Check "disk space" "powershell" @("-NoProfile", "-Command", "Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{Name='FreeGB';Expression={[math]::Round($_.Free/1GB,2)}},@{Name='UsedGB';Expression={[math]::Round($_.Used/1GB,2)}} | Format-Table -AutoSize")
$checks += Run-Check "tao version" "tao" @("--version")
$checks += Run-Check "tao ocdnet help" "tao" @("model", "ocdnet", "--help")
$checks += Run-Check "tao ocrnet help" "tao" @("model", "ocrnet", "--help")
$checks += Run-Check "wsl nvidia-smi" "wsl" @("bash", "-lc", "nvidia-smi")
$checks += Run-Check "wsl docker version" "wsl" @("bash", "-lc", "docker version")
$checks += Run-Check "wsl python3 version" "wsl" @("bash", "-lc", "python3 --version")

$gpuReady = ($checks | Where-Object { $_.name -eq "nvidia-smi" }).status -eq "OK"
$dockerReady = ($checks | Where-Object { $_.name -eq "docker info" }).status -eq "OK"
if ($gpuReady -and $dockerReady) {
  $imageCheck = Run-Check "local CUDA image discovery" "docker" @("images", "--format", "{{.Repository}}:{{.Tag}}")
  $checks += $imageCheck
  $cudaImage = (($imageCheck.output -split "`r?`n") | Where-Object { $_ -like "nvidia/cuda:*" } | Select-Object -First 1)
  if ($cudaImage) {
    $checks += Run-Check "CUDA container GPU test" "docker" @("run", "--rm", "--gpus", "all", $cudaImage, "nvidia-smi")
  } else {
    $checks += Run-Skipped "CUDA container GPU test" "No local nvidia/cuda image was found. Pull a currently compatible CUDA image after verifying it against installed NVIDIA documentation."
  }
} else {
  $checks += Run-Skipped "CUDA container GPU test" "Skipped because local GPU or Docker daemon is not available."
}

$taoReady = ($checks | Where-Object { $_.name -eq "tao version" }).status -eq "OK"
$status = if (-not $gpuReady) { "GPU_NOT_AVAILABLE" } elseif (-not $dockerReady) { "DOCKER_GPU_NOT_AVAILABLE" } elseif (-not $taoReady) { "TAO_NOT_INSTALLED" } else { "READY_FOR_TAO_TRAINING" }
if ($status -ne "READY_FOR_TAO_TRAINING") { $status = "READY_FOR_SCAFFOLDING_ONLY ($status)" }

$lines = @()
$lines += "# NVIDIA OCR Preflight Report"
$lines += ""
$lines += "- Generated: $(Get-Date -Format o)"
$lines += "- Status: $status"
$lines += ""
$lines += "## Checks"
foreach ($check in $checks) {
  $lines += ""
  $lines += "### $($check.name)"
  $lines += "- Status: $($check.status)"
  if ($null -ne $check.exitCode) { $lines += "- Exit code: $($check.exitCode)" }
  $lines += '```text'
  $lines += ($check.output -replace '```', "'''")
  $lines += '```'
}

$lines | Set-Content -Path $Report -Encoding UTF8
Write-Output "Preflight status: $status"
Write-Output "Report: $Report"
exit 0

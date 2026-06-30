param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("preflight","validate-data","split-data","export-data","train-detector","evaluate-detector","train-recognizer","evaluate-recognizer","export-models","test-inference","benchmark")]
  [string]$Command
)

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

switch ($Command) {
  "preflight" { & "$Root\scripts\preflight.ps1" }
  "validate-data" { python "$Root\dataset-tools\validate_dataset.py" }
  "split-data" { python "$Root\dataset-tools\split_dataset.py" }
  "export-data" {
    python "$Root\dataset-tools\export_ocdnet_dataset.py"
    python "$Root\dataset-tools\export_ocrnet_dataset.py"
  }
  "test-inference" { python "$Root\scripts\test_real_page.py" }
  "benchmark" { python "$Root\evaluation\benchmark_runtime.py" }
  default {
    Write-Error "This command requires WSL/Linux with TAO: $Command"
    exit 2
  }
}

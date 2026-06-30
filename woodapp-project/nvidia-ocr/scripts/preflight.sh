#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT="$ROOT/PREFLIGHT_REPORT.md"

run_check() {
  local name="$1"
  shift
  local output status exit_code
  set +e
  output="$("$@" 2>&1)"
  exit_code=$?
  set -e
  status="FAILED"
  if [[ "$exit_code" -eq 0 ]]; then status="OK"; fi
  {
    echo
    echo "### $name"
    echo "- Status: $status"
    echo "- Exit code: $exit_code"
    echo '```text'
    echo "$output" | sed "s/\`\`\`/'''/g"
    echo '```'
  } >> "$REPORT"
}

{
  echo "# NVIDIA OCR Preflight Report"
  echo
  echo "- Generated: $(date -Iseconds)"
  echo "- Status: pending"
  echo
  echo "## Checks"
} > "$REPORT"

run_check "nvidia-smi" nvidia-smi
run_check "docker version" docker version
run_check "docker info" docker info
run_check "python3 version" python3 --version
run_check "tao version" tao --version
run_check "tao ocdnet help" tao model ocdnet --help
run_check "tao ocrnet help" tao model ocrnet --help
run_check "system memory" bash -lc "free -h"
run_check "disk space" bash -lc "df -h ."

echo "Report: $REPORT"

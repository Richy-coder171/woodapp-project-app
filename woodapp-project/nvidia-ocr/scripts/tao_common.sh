#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_ROOT="$ROOT/reports"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_DIR="$REPORT_ROOT/$STAMP"
mkdir -p "$REPORT_DIR"

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Required file missing: $path" >&2
    exit 2
  fi
}

require_dir() {
  local path="$1"
  if [[ ! -d "$path" ]]; then
    echo "Required directory missing: $path" >&2
    exit 2
  fi
}

require_gpu() {
  if ! command -v nvidia-smi >/dev/null 2>&1 || ! nvidia-smi >/dev/null 2>&1; then
    echo "NVIDIA GPU is not available. Training/export requiring CUDA is blocked." >&2
    exit 3
  fi
}

run_tao() {
  if ! command -v tao >/dev/null 2>&1; then
    echo "TAO CLI is not installed or not on PATH." >&2
    exit 4
  fi
  echo "+ tao $*" | tee "$REPORT_DIR/command.txt"
  tao "$@" 2>&1 | tee "$REPORT_DIR/output.log"
}

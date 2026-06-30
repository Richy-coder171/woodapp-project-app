#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMMAND="${1:-}"

case "$COMMAND" in
  preflight) bash "$ROOT/scripts/preflight.sh" ;;
  validate-data) python "$ROOT/dataset-tools/validate_dataset.py" ;;
  split-data) python "$ROOT/dataset-tools/split_dataset.py" ;;
  export-data)
    python "$ROOT/dataset-tools/export_ocdnet_dataset.py"
    python "$ROOT/dataset-tools/export_ocrnet_dataset.py"
    ;;
  train-detector) bash "$ROOT/scripts/train_ocdnet.sh" ;;
  evaluate-detector) bash "$ROOT/scripts/evaluate_ocdnet.sh" ;;
  train-recognizer) bash "$ROOT/scripts/train_ocrnet.sh" ;;
  evaluate-recognizer) bash "$ROOT/scripts/evaluate_ocrnet.sh" ;;
  export-models)
    bash "$ROOT/scripts/export_ocdnet.sh"
    bash "$ROOT/scripts/export_ocrnet.sh"
    ;;
  test-inference) python "$ROOT/scripts/test_real_page.py" ;;
  benchmark) python "$ROOT/evaluation/benchmark_runtime.py" ;;
  *)
    echo "Usage: $0 {preflight|validate-data|split-data|export-data|train-detector|evaluate-detector|train-recognizer|evaluate-recognizer|export-models|test-inference|benchmark}" >&2
    exit 2
    ;;
esac

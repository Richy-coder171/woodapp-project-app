#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/tao_common.sh"
require_file "$ROOT/config/ocrnet/train.yaml"
run_tao model ocrnet dataset_convert --help
python "$ROOT/dataset-tools/export_ocrnet_dataset.py"

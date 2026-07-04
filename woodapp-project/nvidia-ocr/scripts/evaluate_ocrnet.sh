#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/tao_common.sh"
require_gpu
require_file "$ROOT/config/ocrnet/evaluate.yaml"
run_tao model ocrnet evaluate -e "$ROOT/config/ocrnet/evaluate.yaml"

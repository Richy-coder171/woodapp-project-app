#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/tao_common.sh"
require_gpu
require_file "$ROOT/config/ocrnet/inference.yaml"
run_tao model ocrnet inference -e "$ROOT/config/ocrnet/inference.yaml"

#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/tao_common.sh"
require_gpu
require_file "$ROOT/config/ocrnet/export.yaml"
run_tao model ocrnet export -e "$ROOT/config/ocrnet/export.yaml"

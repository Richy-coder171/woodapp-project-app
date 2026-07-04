#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/tao_common.sh"
require_gpu
require_file "$ROOT/config/ocdnet/export.yaml"
run_tao model ocdnet export -e "$ROOT/config/ocdnet/export.yaml"

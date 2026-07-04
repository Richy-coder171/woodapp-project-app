#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/tao_common.sh"
require_gpu
require_file "$ROOT/config/ocdnet/evaluate.yaml"
run_tao model ocdnet evaluate -e "$ROOT/config/ocdnet/evaluate.yaml"

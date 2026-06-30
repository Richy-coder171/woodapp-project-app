#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/tao_common.sh"
require_gpu
require_file "$ROOT/config/ocdnet/inference.yaml"
run_tao model ocdnet inference -e "$ROOT/config/ocdnet/inference.yaml"

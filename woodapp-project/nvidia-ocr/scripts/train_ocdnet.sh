#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/tao_common.sh"
require_gpu
require_file "$ROOT/config/ocdnet/train.yaml"
require_dir "$ROOT/data/tao-ocdnet"
run_tao model ocdnet train -e "$ROOT/config/ocdnet/train.yaml"

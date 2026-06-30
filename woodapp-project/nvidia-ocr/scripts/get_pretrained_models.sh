#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cat <<'MSG'
This script intentionally does not download large pretrained models automatically.

Before downloading:
1. Install and authenticate NVIDIA NGC/TAO tooling.
2. Run:
   tao --version
   tao model ocdnet --help
   tao model ocrnet --help
3. Identify official compatible OCDNet and OCRNet pretrained models for that TAO version.
4. Confirm licenses and destination paths.

Expected destinations:
  OCDNet: nvidia-ocr/models/pretrained/ocdnet/
  OCRNet: nvidia-ocr/models/pretrained/ocrnet/

No NGC API keys or credentials should be committed.
MSG

mkdir -p "$ROOT/models/pretrained/ocdnet" "$ROOT/models/pretrained/ocrnet"

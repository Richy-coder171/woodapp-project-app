from __future__ import annotations

import argparse


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    parser.parse_args()
    print("Quantization skeleton ready. Measure FP32 accuracy before quantization.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

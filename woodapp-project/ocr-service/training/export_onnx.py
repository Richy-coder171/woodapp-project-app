from __future__ import annotations

import argparse


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--output", default="models/woodapp-recognizer-v1.onnx")
    parser.parse_args()
    print("ONNX export skeleton ready. Export after a trained checkpoint exists.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

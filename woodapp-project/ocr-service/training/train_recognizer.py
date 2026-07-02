from __future__ import annotations

import argparse


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-manifest", required=True)
    parser.add_argument("--validation-manifest", required=True)
    parser.add_argument("--output-dir", default="models/woodapp-domain-v1")
    parser.parse_args()
    print("Training skeleton ready. Add a CRNN-CTC implementation after annotated data is collected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

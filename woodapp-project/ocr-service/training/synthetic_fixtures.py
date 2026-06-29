from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def render_dense_page(columns: int, rows: int, output: Path) -> None:
    image = np.full((1200, 1000, 3), (248, 246, 238), dtype=np.uint8)
    for column in range(columns):
        for row in range(rows):
            text = f"{row + 4} x {12 + column}"
            cv2.putText(image, text, (35 + column * (900 // columns), 80 + row * 72), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (150, 70, 25), 2, cv2.LINE_AA)
    output.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output), image)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--rows", type=int, default=15)
    parser.add_argument("--output", default="tmp/domain-fixture.png")
    args = parser.parse_args()
    render_dense_page(args.columns, args.rows, Path(args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

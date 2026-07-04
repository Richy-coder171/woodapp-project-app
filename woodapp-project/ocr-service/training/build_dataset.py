from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="datasets/woodapp_measurements")
    args = parser.parse_args()
    root = Path(args.dataset)
    annotations = root / "annotations"
    crops = root / "crops"
    manifest = root / "manifests" / "all.jsonl"
    crops.mkdir(parents=True, exist_ok=True)
    manifest.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    for annotation_path in sorted(annotations.glob("*.json")):
        annotation = json.loads(annotation_path.read_text(encoding="utf-8"))
        image_path = root / "pages" / annotation["image"]
        image = cv2.imread(str(image_path))
        if image is None:
            continue
        for index, item in enumerate(annotation.get("measurements", [])):
            box = item["box"]
            x1 = max(0, int(round(box["x"])))
            y1 = max(0, int(round(box["y"])))
            x2 = min(image.shape[1], int(round(box["x"] + box["width"])))
            y2 = min(image.shape[0], int(round(box["y"] + box["height"])))
            if x2 <= x1 or y2 <= y1:
                continue
            crop_name = f"{annotation_path.stem}-{index:04d}.png"
            cv2.imwrite(str(crops / crop_name), image[y1:y2, x1:x2])
            rows.append({
                "crop": f"crops/{crop_name}",
                "text": item["text"],
                "writerId": annotation.get("writerId", "writer-unknown"),
                "source": annotation["image"],
            })
    manifest.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
    print(f"wrote {len(rows)} rows to {manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

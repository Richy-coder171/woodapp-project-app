from __future__ import annotations

import json
from pathlib import Path
import sys

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "dataset-tools"
INFERENCE = ROOT / "inference"
sys.path.insert(0, str(TOOLS))
sys.path.insert(0, str(INFERENCE))

from annotation_schema import validate_annotation  # noqa: E402
from export_ocdnet_dataset import export_ocdnet_dataset  # noqa: E402
from export_ocrnet_dataset import export_ocrnet_dataset  # noqa: E402
from grammar import is_supported_label, normalize_label  # noqa: E402
from split_dataset import split_dataset  # noqa: E402
from ocdnet_runtime import DetectedMeasurement, box_from_polygon, sort_and_limit_detections  # noqa: E402
from ocrnet_runtime import RecognitionResult, greedy_ctc_decode  # noqa: E402


def page(writer: str = "writer-001") -> dict:
    return {
        "image": "page-001.jpg",
        "sourcePageId": "page-001",
        "writerId": writer,
        "width": 200,
        "height": 100,
        "measurements": [
            {"id": "measurement-0001", "polygon": [[10, 10], [80, 10], [80, 30], [10, 30]], "text": "43x24"}
        ],
    }


def test_measurement_grammar_and_dictionary() -> None:
    assert normalize_label("43 × 24") == "43x24"
    assert normalize_label("42.5 X 18") == "42.5x18"
    assert is_supported_label("43x24")
    assert not is_supported_label("43?24")


def test_annotation_validation_rejects_invalid_polygon_and_writer() -> None:
    data = page("")
    data["measurements"][0]["polygon"] = [[10, 10], [80, 30], [80, 10], [10, 30]]
    codes = {issue.code for issue in validate_annotation(data)}
    assert "missing_writer_id" in codes
    assert "self_intersecting_polygon" in codes


def test_writer_aware_split_has_no_leakage(tmp_path: Path) -> None:
    annotations = tmp_path / "annotations"
    manifests = tmp_path / "manifests"
    annotations.mkdir()
    for index, writer in enumerate(["writer-a", "writer-a", "writer-b", "writer-c"]):
        data = page(writer)
        data["image"] = f"page-{index}.jpg"
        data["sourcePageId"] = f"page-{index}"
        (annotations / f"page-{index}.json").write_text(json.dumps(data), encoding="utf-8")
    report = split_dataset(annotations, manifests, seed=7, ratios=(0.5, 0.25, 0.25))
    assert report["writerLeakageCount"] == 0
    assert (manifests / "train.jsonl").exists()
    assert (manifests / "validation.jsonl").exists()
    assert (manifests / "test.jsonl").exists()


def test_dataset_converters_create_outputs(tmp_path: Path) -> None:
    annotations = tmp_path / "annotations"
    pages = tmp_path / "source-pages"
    annotations.mkdir()
    pages.mkdir()
    data = page()
    (annotations / "page-001.json").write_text(json.dumps(data), encoding="utf-8")
    cv2.imwrite(str(pages / "page-001.jpg"), np.full((100, 200, 3), 255, dtype=np.uint8))
    ocd = export_ocdnet_dataset(annotations, pages, tmp_path / "tao-ocdnet")
    ocr = export_ocrnet_dataset(annotations, pages, tmp_path / "tao-ocrnet", tmp_path / "crops")
    assert ocd["pagesExported"] == 1
    assert ocr["measurementsExported"] == 1
    assert (tmp_path / "crops" / "page-001_measurement-0001.png").exists()


def test_runtime_helpers_sort_decode_and_box() -> None:
    detections = [
        DetectedMeasurement([[80, 30], [100, 30], [100, 40], [80, 40]], 0.9),
        DetectedMeasurement([[10, 10], [40, 10], [40, 20], [10, 20]], 0.9),
    ]
    ordered = sort_and_limit_detections(detections, 100)
    assert ordered[0].polygon[0][0] == 10
    assert box_from_polygon(ordered[0].polygon, 200, 100)["width"] == 30
    assert greedy_ctc_decode([0, 5, 5, 0, 4, 11], "0123456789x.") == "43x"
    assert RecognitionResult("43X24", "43x24", 0.95, True).valid

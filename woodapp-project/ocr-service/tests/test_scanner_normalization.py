from scanner import (
    OcrLine,
    RapidOcrScanner,
    _candidate_detections,
    _create_blue_ink_mask,
    _extract_lines,
    _group_components_into_lines,
    normalize_measurement_text,
    parse_measurement,
    detect_opencv_regions,
)
from preprocessing import prepare_image

import cv2
import numpy as np


def box(x, y, width, height):
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]


def rect(x, y, width, height):
    return {"x": float(x), "y": float(y), "width": float(width), "height": float(height)}


def synthetic_five_line_image():
    image = np.full((900, 600, 3), (248, 246, 238), dtype=np.uint8)
    for index, text in enumerate(["4 x 12", "5 x 14", "3 x 17", "2 x 13", "6 x 12"]):
        cv2.putText(
            image,
            text,
            (120, 160 + index * 90),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.65,
            (165, 86, 29),
            3,
            cv2.LINE_AA,
        )
    return image


def encode_jpeg(image):
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return encoded.tobytes()


def test_normalizes_common_ocr_separators():
    assert normalize_measurement_text("45 x 36") == "45 x 36"
    assert normalize_measurement_text("45*36") == "45 x 36"
    assert normalize_measurement_text("45 X 36") == "45 x 36"


def test_decimal_commas_and_context_digits_are_normalized():
    assert normalize_measurement_text("4,5 x O6") == "4.5 x 06"
    assert parse_measurement("4,5 x 36") == {"aRaw": "4.5", "bRaw": "36"}


def test_rapidocr_mapping_response_shape_is_extracted():
    result = {
        "res": {
            "rec_texts": ["4 x 12", "5 x 14"],
            "rec_scores": [0.81, 0.74],
            "rec_polys": [box(100, 110, 160, 42), box(100, 170, 162, 42)],
        }
    }

    lines, known_shape = _extract_lines(result)

    assert known_shape is True
    assert [line.text for line in lines] == ["4 x 12", "5 x 14"]
    assert lines[0].confidence == 0.81


def test_split_ocr_pieces_are_joined_into_one_measurement():
    lines = [
        OcrLine(box(100, 120, 28, 40), "4", 0.82),
        OcrLine(box(140, 121, 20, 39), "x", 0.77),
        OcrLine(box(172, 119, 58, 42), "12", 0.79),
    ]

    detections = _candidate_detections(lines, 600, 900)

    assert len(detections) == 1
    assert detections[0]["normalizedText"] == "4 x 12"
    assert detections[0]["selected"] is True
    assert detections[0]["box"]["width"] > 100


def test_five_line_fixture_returns_five_independent_detections():
    texts = ["4 x 12", "5 x 14", "3 x 17", "2 x 13", "6 x 12"]
    lines = [
        OcrLine(box(120, 120 + index * 90, 170, 46), text, 0.7)
        for index, text in enumerate(texts)
    ]

    detections = _candidate_detections(lines, 600, 900)

    assert len(detections) == 5
    assert [item["normalizedText"] for item in detections] == texts
    assert all(item["selected"] is True for item in detections)
    assert all(item["box"]["width"] > 0 and item["box"]["height"] > 0 for item in detections)


def test_opencv_five_line_fixture_produces_ordered_regions():
    regions, _ = detect_opencv_regions(synthetic_five_line_image())

    assert len(regions) == 5
    boxes = [region.box for region in regions]
    assert [box["y"] for box in boxes] == sorted(box["y"] for box in boxes)
    assert all(box["width"] > 0 and box["height"] > 0 for box in boxes)


def test_blue_handwriting_remains_visible_after_masking():
    mask = _create_blue_ink_mask(synthetic_five_line_image())

    assert cv2.countNonZero(mask) > 1000


def test_opencv_fallback_activates_when_rapidocr_returns_zero():
    class EmptyOcr:
        def ocr(self, image, cls=True):
            return []

    scanner = RapidOcrScanner.__new__(RapidOcrScanner)
    scanner.ocr = EmptyOcr()
    prepared = prepare_image(encode_jpeg(synthetic_five_line_image()))

    detections, diagnostics = scanner._detect(prepared)

    assert diagnostics["OpenCV region count"] == 5
    assert len(detections) == 5
    assert all(item["selected"] is True for item in detections)


def test_rapidocr_engine_is_reused_for_all_regions():
    class CountingOcr:
        def __init__(self):
            self.calls = 0

        def __call__(self, image):
            self.calls += 1
            return []

    engine = CountingOcr()
    scanner = RapidOcrScanner(ocr_engine=engine)
    prepared = prepare_image(encode_jpeg(synthetic_five_line_image()))

    detections, diagnostics = scanner._detect(prepared)

    assert engine.calls >= 1
    assert scanner.ocr is engine
    assert diagnostics["OpenCV region count"] == 5
    assert len(detections) == 5


def test_four_column_grouping_stays_separate():
    components = []
    for column in range(4):
        for row in range(3):
            x = 60 + column * 220
            y = 80 + row * 90
            components.extend([
                rect(x, y, 18, 36),
                rect(x + 34, y + 3, 18, 30),
                rect(x + 68, y, 48, 36),
            ])

    lines = _group_components_into_lines(components, 1000, 500)

    assert len(lines) == 12
    centers = sorted(round(item["x"] + item["width"] / 2, -1) for item in lines)
    assert len(set(centers)) >= 4

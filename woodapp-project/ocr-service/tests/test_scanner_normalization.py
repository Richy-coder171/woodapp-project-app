from scanner import (
    OcrLine,
    _candidate_detections,
    _extract_lines,
    normalize_measurement_text,
    parse_measurement,
)


def box(x, y, width, height):
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]


def test_normalizes_common_ocr_separators():
    assert normalize_measurement_text("45 x 36") == "45 x 36"
    assert normalize_measurement_text("45*36") == "45 x 36"
    assert normalize_measurement_text("45 X 36") == "45 x 36"


def test_decimal_commas_and_context_digits_are_normalized():
    assert normalize_measurement_text("4,5 x O6") == "4.5 x 06"
    assert parse_measurement("4,5 x 36") == {"aRaw": "4.5", "bRaw": "36"}


def test_paddleocr_v3_response_shape_is_extracted():
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

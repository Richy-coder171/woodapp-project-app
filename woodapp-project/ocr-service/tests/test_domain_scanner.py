from io import BytesIO

import cv2
import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

import app as app_module
from domain_scanner.crop_normalization import crop_line, normalize_crop
from domain_scanner.decoder import greedy_ctc_decode
from domain_scanner.grammar import normalize_symbol_text, parse_measurement
from domain_scanner.inference import DomainScanner
from domain_scanner.line_detector import detect_measurement_lines
from domain_scanner.recognizer import StaticRecognizer
from domain_scanner.schemas import LineBox


def dense_page(columns=4, rows=15):
    page_width = max(1000, columns * 230)
    image = np.full((1200, page_width, 3), (248, 246, 238), dtype=np.uint8)
    for column in range(columns):
        for row in range(rows):
            cv2.putText(
                image,
                f"{row + 4} x {12 + column}",
                (35 + column * 220, 80 + row * 72),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (150, 70, 25),
                2,
                cv2.LINE_AA,
            )
    return image


def jpeg_bytes(image):
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    buffer = BytesIO()
    pil.save(buffer, format="JPEG")
    return buffer.getvalue()


def test_domain_grammar_and_restricted_vocabulary():
    assert normalize_symbol_text("43 X 24.5") == "43x24.5"
    assert parse_measurement("43*30") == ("43", "30")
    assert parse_measurement("43a30") is None


def test_greedy_ctc_decoder_collapses_duplicates_and_blanks():
    assert greedy_ctc_decode([0, 5, 5, 0, 4, 11], "0123456789x.") == "43x"


def test_crop_normalization_rejects_empty_and_preserves_shape():
    image = dense_page(1, 1)
    crop = crop_line(image, LineBox(20, 40, 180, 60))
    normalized = normalize_crop(crop)
    assert normalized.shape == (48, 256)
    assert crop_line(image, LineBox(2000, 2000, 10, 10)) is None


def test_domain_detector_finds_one_four_and_six_column_pages():
    one, one_info = detect_measurement_lines(dense_page(1, 10))
    four, four_info = detect_measurement_lines(dense_page(4, 12))
    six, six_info = detect_measurement_lines(dense_page(6, 10))
    assert len(one) >= 8
    assert one_info["columnCount"] == 1
    assert len(four) >= 40
    assert four_info["columnCount"] == 4
    assert len(six) >= 45
    assert six_info["columnCount"] <= 6


def test_domain_scanner_batches_and_marks_valid_selected():
    scanner = DomainScanner(recognizer=StaticRecognizer("43x24"), batch_size=16)
    payload = scanner.recognize_image(dense_page(4, 15))
    assert payload["engine"] == "woodapp-domain-v1"
    assert payload["diagnostics"]["detectedLines"] >= 55
    assert payload["diagnostics"]["batches"] <= 4
    assert payload["detections"]
    assert all(item["selected"] is True for item in payload["detections"])
    assert all(item["valid"] is True for item in payload["detections"])


def test_domain_scanner_invalid_output_starts_unselected():
    scanner = DomainScanner(recognizer=StaticRecognizer("not valid", confidence=0.2))
    payload = scanner.recognize_image(dense_page(1, 5))
    assert payload["detections"]
    assert all(item["selected"] is False for item in payload["detections"])
    assert all(item["valid"] is False for item in payload["detections"])


def test_recognize_domain_endpoint_returns_http_200_with_detections():
    app_module.DOMAIN_ENGINE = DomainScanner(recognizer=StaticRecognizer("43x24"))
    client = TestClient(app_module.app)
    response = client.post(
        "/recognize-domain",
        files={"file": ("dense.jpeg", jpeg_bytes(dense_page(2, 8)), "image/jpeg")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["engine"] == "woodapp-domain-v1"
    assert body["detections"]

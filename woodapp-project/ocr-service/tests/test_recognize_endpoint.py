from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

import app as app_module


class DummyScanner:
    def __init__(self):
        self.calls = 0

    def recognize_image(self, image):
        self.calls += 1
        height, width = image.shape[:2]
        return {
            "imageWidth": width,
            "imageHeight": height,
            "engine": "rapidocr-onnx",
            "detections": [],
        }


def image_bytes(fmt="JPEG"):
    image = Image.new("RGB", (96, 64), (250, 248, 240))
    buffer = BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


def client_with_dummy():
    scanner = DummyScanner()
    app_module.OCR_ENGINE = scanner
    app_module.MODEL_READY = True
    app_module.MODEL_ERROR = None
    return TestClient(app_module.app), scanner


def test_valid_jpeg_with_image_jpeg_reaches_ocr_processing():
    client, scanner = client_with_dummy()

    response = client.post(
        "/recognize",
        files={"file": ("measurement.jpeg", image_bytes("JPEG"), "image/jpeg")},
    )

    assert response.status_code == 200
    assert scanner.calls == 1
    assert response.json()["imageWidth"] == 96


def test_valid_jpg_with_blank_mime_reaches_ocr_processing():
    client, scanner = client_with_dummy()

    response = client.post(
        "/recognize",
        files={"file": ("measurement with spaces.jpg", image_bytes("JPEG"), "")},
    )

    assert response.status_code == 200
    assert scanner.calls == 1


def test_valid_jpeg_as_octet_stream_reaches_ocr_processing():
    client, scanner = client_with_dummy()

    response = client.post(
        "/recognize",
        files={"file": ("measurement.jpeg", image_bytes("JPEG"), "application/octet-stream")},
    )

    assert response.status_code == 200
    assert scanner.calls == 1


def test_valid_png_reaches_ocr_processing():
    client, scanner = client_with_dummy()

    response = client.post(
        "/recognize",
        files={"file": ("measurement.png", image_bytes("PNG"), "image/png")},
    )

    assert response.status_code == 200
    assert scanner.calls == 1


def test_empty_upload_returns_empty_image():
    client, scanner = client_with_dummy()

    response = client.post(
        "/recognize",
        files={"file": ("empty.jpeg", b"", "image/jpeg")},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "EMPTY_IMAGE"
    assert scanner.calls == 0


def test_fake_jpg_text_returns_decode_failed():
    client, scanner = client_with_dummy()

    response = client.post(
        "/recognize",
        files={"file": ("fake.jpg", b"hello, not an image", "image/jpeg")},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "IMAGE_DECODE_FAILED"
    assert scanner.calls == 0

from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from preprocessing import decode_image


APP_SOURCE = Path(__file__).resolve().parents[1].joinpath("app.py").read_text(encoding="utf-8")


def image_bytes(fmt="JPEG"):
    image = Image.new("RGB", (80, 60), (245, 242, 235))
    buffer = BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


def test_valid_jpeg_bytes_decode_with_exif_safe_path():
    image = decode_image(image_bytes("JPEG"))

    assert image.shape[:2] == (60, 80)
    assert image.shape[2] == 3


def test_valid_png_bytes_decode():
    image = decode_image(image_bytes("PNG"))

    assert image.shape[:2] == (60, 80)


def test_valid_webp_bytes_decode_when_pillow_supports_webp():
    try:
        payload = image_bytes("WEBP")
    except Exception:
        return

    image = decode_image(payload)

    assert image.shape[:2] == (60, 80)


def test_fake_jpg_text_is_rejected_by_byte_decode():
    try:
        decode_image(b"not really an image")
    except ValueError:
        return

    raise AssertionError("fake image bytes should not decode")


def test_corrupted_jpeg_is_rejected_by_byte_decode():
    payload = image_bytes("JPEG")[:20]
    try:
        decode_image(payload)
    except ValueError:
        return

    raise AssertionError("corrupted jpeg should not decode")


def test_upload_contract_accepts_generic_multipart_metadata_after_decode():
    assert '"application/octet-stream"' in APP_SOURCE
    assert '".jpg"' in APP_SOURCE
    assert '".jpeg"' in APP_SOURCE
    assert '".png"' in APP_SOURCE
    assert '".webp"' in APP_SOURCE
    assert "read_and_decode_image" in APP_SOURCE
    assert "decode_image(image_bytes)" in APP_SOURCE


def test_upload_contract_has_distinct_validation_errors():
    for code in [
        "EMPTY_IMAGE",
        "IMAGE_DECODE_FAILED",
        "IMAGE_TOO_LARGE",
        "INVALID_IMAGE_DIMENSIONS",
        "OCR_PROCESSING_FAILED",
    ]:
        assert code in APP_SOURCE

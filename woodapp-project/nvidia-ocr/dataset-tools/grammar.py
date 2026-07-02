from __future__ import annotations

import re

VOCABULARY = set("0123456789x.")
MEASUREMENT_RE = re.compile(r"^\d+(?:\.\d+)?x\d+(?:\.\d+)?$")


def normalize_label(text: str, allow_decimal_comma: bool = False) -> str:
    value = str(text or "").strip()
    replacements = {
        "x": "x",
        "X": "x",
        "*": "x",
        "×": "x",
        "Ã—": "x",
        " ": "",
        "\t": "",
        "\n": "",
        "\r": "",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    if allow_decimal_comma:
        value = value.replace(",", ".")
    return value


def is_supported_label(text: str, max_length: int = 16) -> bool:
    value = normalize_label(text)
    return 0 < len(value) <= max_length and set(value).issubset(VOCABULARY) and bool(MEASUREMENT_RE.fullmatch(value))


def label_errors(text: str, max_length: int = 16) -> list[str]:
    normalized = normalize_label(text)
    errors: list[str] = []
    if not normalized:
        errors.append("empty_text")
    if len(normalized) > max_length:
        errors.append("label_too_long")
    unsupported = sorted(set(normalized) - VOCABULARY)
    if unsupported:
        errors.append("unsupported_characters:" + "".join(unsupported))
    if normalized and not MEASUREMENT_RE.fullmatch(normalized):
        errors.append("invalid_measurement_format")
    return errors

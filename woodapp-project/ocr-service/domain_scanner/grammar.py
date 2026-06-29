from __future__ import annotations

import re

MEASUREMENT_RE = re.compile(r"^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$")


def normalize_symbol_text(text: str) -> str:
    value = str(text or "").strip()
    replacements = {
        "×": "x",
        "X": "x",
        "*": "x",
        " ": "",
        "\t": "",
        "\n": "",
        ",": ".",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return value.lower()


def is_supported_text(text: str) -> bool:
    return all(char in "0123456789x." for char in text)


def parse_measurement(text: str) -> tuple[str, str] | None:
    normalized = normalize_symbol_text(text)
    if not is_supported_text(normalized):
        return None
    match = MEASUREMENT_RE.match(normalized)
    if not match:
        return None
    return match.group(1), match.group(2)

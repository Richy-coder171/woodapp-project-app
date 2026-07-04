from __future__ import annotations

import sys
from pathlib import Path

from preprocessing import decode_image
from scanner import _plain


def _count(value):
    value = _plain(value)
    if value is None:
        return 0
    if isinstance(value, (list, tuple)):
        return len(value)
    try:
        return len(value)
    except TypeError:
        return 1


def _first_attr(value, names):
    for name in names:
        attr = getattr(value, name, None)
        if attr is not None:
            return attr
    return None


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python debug_rapidocr.py <image-path>")
        return 2

    image_path = Path(sys.argv[1])
    image = decode_image(image_path.read_bytes())

    from rapidocr import RapidOCR

    engine = RapidOCR()
    result = engine(image)
    public_attrs = []
    for name in dir(result):
        if name.startswith("_"):
            continue
        try:
            attr = getattr(result, name)
        except Exception:
            continue
        if not callable(attr):
            public_attrs.append(name)

    print(f"result_type={type(result).__name__}")
    print(f"public_attrs={sorted(public_attrs)}")
    print(f"box_count={_count(_first_attr(result, ('boxes', 'rec_polys')))}")
    print(f"text_count={_count(_first_attr(result, ('txts', 'rec_texts')))}")
    print(f"score_count={_count(_first_attr(result, ('scores', 'rec_scores')))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

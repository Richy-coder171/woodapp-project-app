from __future__ import annotations

import json
from pathlib import Path

from .schemas import PageAnnotation


def annotation_to_dict(annotation: PageAnnotation) -> dict:
    if hasattr(annotation, "model_dump"):
        return annotation.model_dump()
    return annotation.dict()


def load_annotation(path: str | Path) -> PageAnnotation:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if hasattr(PageAnnotation, "model_validate"):
        return PageAnnotation.model_validate(data)
    return PageAnnotation.parse_obj(data)


def save_annotation(annotation: PageAnnotation, path: str | Path) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if hasattr(annotation, "model_dump_json"):
        body = annotation.model_dump_json(indent=2)
    else:
        body = annotation.json(indent=2)
    target.write_text(body, encoding="utf-8")

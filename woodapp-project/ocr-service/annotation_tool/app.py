from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException

from .schemas import PageAnnotation
from .storage import annotation_to_dict, load_annotation, save_annotation

app = FastAPI(title="WoodApp Annotation Tool", version="0.1.0")
ANNOTATION_ROOT = Path("datasets/woodapp_measurements/annotations")


@app.get("/annotations/{name}")
def get_annotation(name: str) -> dict:
    path = ANNOTATION_ROOT / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Annotation not found")
    return annotation_to_dict(load_annotation(path))


@app.post("/annotations/{name}")
def put_annotation(name: str, annotation: PageAnnotation) -> dict:
    save_annotation(annotation, ANNOTATION_ROOT / name)
    return {"ok": True}

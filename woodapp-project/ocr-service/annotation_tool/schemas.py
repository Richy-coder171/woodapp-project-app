from __future__ import annotations

from pydantic import BaseModel, Field


class Box(BaseModel):
    x: float
    y: float
    width: float
    height: float


class MeasurementAnnotation(BaseModel):
    box: Box
    text: str


class PageAnnotation(BaseModel):
    image: str
    writerId: str = Field(default="writer-unknown")
    width: int
    height: int
    measurements: list[MeasurementAnnotation]

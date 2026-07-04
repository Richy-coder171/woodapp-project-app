from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass(frozen=True)
class Transform:
    to_original: np.ndarray


@dataclass
class PreparedPage:
    original_width: int
    original_height: int
    image: np.ndarray
    transform: Transform


@dataclass
class LineBox:
    x: float
    y: float
    width: float
    height: float
    column_index: int = 0
    row_index: int = 0

    def to_dict(self) -> dict[str, float]:
        return {
            "x": float(round(self.x, 2)),
            "y": float(round(self.y, 2)),
            "width": float(round(self.width, 2)),
            "height": float(round(self.height, 2)),
        }


@dataclass
class Recognition:
    raw_text: str
    normalized_text: str
    confidence: float
    valid: bool
    reason: str = ""


@dataclass
class DomainResult:
    status: str
    engine: str
    image_width: int
    image_height: int
    detections: list[dict[str, Any]]
    diagnostics: dict[str, Any] = field(default_factory=dict)

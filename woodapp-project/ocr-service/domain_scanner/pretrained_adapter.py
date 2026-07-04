from __future__ import annotations

import numpy as np

from .recognizer import BaseRecognizer
from .schemas import Recognition


class PretrainedRecognizerBenchmark(BaseRecognizer):
    """Placeholder adapter for TrOCR or similar benchmarks.

    It is intentionally not used as production inference until a benchmark
    implementation and measured accuracy are supplied.
    """

    def recognize_batch(self, crops: list[np.ndarray]) -> list[Recognition]:
        return [Recognition("", "", 0.0, False, "pretrained_adapter_not_configured") for _ in crops]

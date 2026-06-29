from __future__ import annotations

import os

ENGINE_NAME = "woodapp-domain-v1"
VOCABULARY = "0123456789x."
MAX_COLUMNS = int(os.getenv("DOMAIN_MAX_COLUMNS", "6"))
MAX_MEASUREMENTS = int(os.getenv("DOMAIN_MAX_MEASUREMENTS", "80"))
MAX_PROCESSING_SIDE = int(os.getenv("DOMAIN_MAX_PROCESSING_SIDE", "2000"))
BATCH_SIZE = int(os.getenv("DOMAIN_BATCH_SIZE", "16"))
LOW_CONFIDENCE_THRESHOLD = float(os.getenv("DOMAIN_LOW_CONFIDENCE", "0.65"))
CROP_HEIGHT = int(os.getenv("DOMAIN_CROP_HEIGHT", "48"))
MAX_CROP_WIDTH = int(os.getenv("DOMAIN_MAX_CROP_WIDTH", "256"))

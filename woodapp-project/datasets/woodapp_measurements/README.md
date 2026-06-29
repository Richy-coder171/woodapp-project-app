# WoodApp Measurement Dataset

Private dataset layout:

```text
pages/
annotations/
crops/
manifests/
```

Do not commit private pages, crops, annotations, or manifests. Use writer-aware
splits so a writer in training never appears in test data.

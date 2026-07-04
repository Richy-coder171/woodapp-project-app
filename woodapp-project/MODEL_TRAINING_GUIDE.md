# Model Training Guide

First collect real annotated handwriting. Then:

```powershell
cd D:\woodapp-project\woodapp-project\ocr-service
python training\build_dataset.py --dataset ..\datasets\woodapp_measurements
python training\split_dataset.py --manifest ..\datasets\woodapp_measurements\manifests\all.jsonl
python training\train_recognizer.py --train-manifest ..\datasets\woodapp_measurements\manifests\train.jsonl --validation-manifest ..\datasets\woodapp_measurements\manifests\validation.jsonl
```

Primary metric:

```text
Exact measurement accuracy
```

Also track character accuracy, invalid-format rate, detection recall, end-to-end page accuracy, and latency.

The training script is a runnable milestone skeleton. A CRNN-CTC implementation should be added after enough labeled data exists.


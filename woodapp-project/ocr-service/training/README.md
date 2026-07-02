# WoodApp Domain Recognizer Training

This folder contains runnable scaffolding for the first domain-scanner milestone.

Typical flow:

```powershell
python training\build_dataset.py --dataset datasets\woodapp_measurements
python training\split_dataset.py --manifest datasets\woodapp_measurements\manifests\all.jsonl
python training\train_recognizer.py --train-manifest datasets\woodapp_measurements\manifests\train.jsonl --validation-manifest datasets\woodapp_measurements\manifests\validation.jsonl
```

The recognizer is not production-ready until real writer-separated data is collected,
trained, evaluated, exported to ONNX, and benchmarked.

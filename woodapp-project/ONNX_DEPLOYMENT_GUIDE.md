# ONNX Deployment Guide

After a trained FP32 checkpoint is validated:

```powershell
python training\export_onnx.py --checkpoint path\to\checkpoint.pt --output models\woodapp-recognizer-v1.onnx
python training\quantize_onnx.py --model models\woodapp-recognizer-v1.onnx --output models\woodapp-recognizer-v1.int8.onnx
```

Do not quantize before measuring FP32 accuracy.

Android readiness requires:

- ONNX Runtime Mobile dependency.
- Model asset loading.
- Crop normalization matching desktop inference.
- Batch inference.
- Greedy or beam decoding.
- Coordinate mapping from camera image to preview overlay.
- Memory and thread benchmarks.

Android integration should wait until desktop metrics pass target thresholds.


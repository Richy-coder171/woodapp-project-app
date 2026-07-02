# Pretrained Models

No pretrained model files are committed to this repository.

Required before training:

- Official NVIDIA TAO-compatible OCDNet pretrained checkpoint for text/line detection.
- Official NVIDIA TAO-compatible OCRNet pretrained checkpoint for text recognition.

The exact model names and versions must be selected after running:

```bash
tao --version
tao model ocdnet --help
tao model ocrnet --help
```

Use authenticated NVIDIA tooling or NGC according to NVIDIA license terms. Do not commit credentials, API keys, model archives, checkpoints, ONNX files, TensorRT engines, or converted artifacts.

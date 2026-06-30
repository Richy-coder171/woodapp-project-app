# NVIDIA Training

Training is pending until:

- Preflight reports TAO/GPU/Docker readiness.
- Private pages are annotated.
- Writer-aware splits are generated.
- Official compatible pretrained OCDNet and OCRNet checkpoints are acquired.
- TAO command help is verified on the target machine.

Prepared commands:

```bash
bash nvidia-ocr/scripts/woodapp-nvidia.sh validate-data
bash nvidia-ocr/scripts/woodapp-nvidia.sh split-data
bash nvidia-ocr/scripts/woodapp-nvidia.sh export-data
bash nvidia-ocr/scripts/woodapp-nvidia.sh train-detector
bash nvidia-ocr/scripts/woodapp-nvidia.sh evaluate-detector
bash nvidia-ocr/scripts/woodapp-nvidia.sh train-recognizer
bash nvidia-ocr/scripts/woodapp-nvidia.sh evaluate-recognizer
```

No training metrics are claimed until evaluation scripts run on real held-out labelled data.

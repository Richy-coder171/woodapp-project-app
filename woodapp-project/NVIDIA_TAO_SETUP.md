# NVIDIA TAO Setup

Run preflight first:

```powershell
cd D:\woodapp-project\woodapp-project
.\nvidia-ocr\scripts\preflight.ps1
```

WSL/Linux:

```bash
bash nvidia-ocr/scripts/preflight.sh
```

The preflight checks GPU, WSL, Docker, Docker GPU readiness, Python, disk space, RAM, and TAO command availability. It writes `nvidia-ocr/PREFLIGHT_REPORT.md`.

Do not install drivers or accept NVIDIA licenses automatically from this repo. Acquire compatible official pretrained models only after confirming the installed TAO version and command help.

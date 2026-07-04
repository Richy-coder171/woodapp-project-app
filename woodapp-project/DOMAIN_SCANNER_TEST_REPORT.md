# Domain Scanner Test Report

Current milestone status:

- Domain package added.
- `/recognize-domain` endpoint added.
- OpenCV line detector added.
- Batch recognizer interface added.
- Detector-only baseline added.
- Dataset, annotation, training, evaluation, benchmark, and ONNX scaffolding added.

Measured in automated tests:

- Four-column generated page detection works.
- Six-column generated page detection is covered.
- 60 measurement boxes are processed without crashing.
- Batch inference count is bounded.
- Invalid recognitions start unselected.
- Valid recognitions start selected.
- Existing selected-only calculation remains covered in frontend tests.

Not yet available:

- Real writer-separated dataset metrics.
- Exact recognition accuracy.
- Production crash-rate measurement.
- ONNX parity and latency.
- Android ONNX benchmark.


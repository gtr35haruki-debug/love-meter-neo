# TEST REPORT v0.4.0-beta.5-local-ai

実行日: 2026-10-29

## PASS

- EVENT child-support / questionnaire behavior
- EVENT_V2 question/timing
- Local AI config / paid API dependency static check
- Heart metrics regression
- 1 Hz jitter regression
- skipped-question exclusion
- EVENT_V2 Question Response local-baseline regression
- DISPLAY_SCORE_V3_PILOT regression
- Research export / privacy / ZIP CRC
- Survey schema
- Voice baseline-relative metrics
- Dual-mic five-state speaker classification
- JavaScript syntax check: app / ai / admin-gate / backend / firebase-backend / local-backend

## LOCAL AI architecture checks

- firebase.json has no Cloud Functions deployment section
- runtime source has no OpenAI endpoint / OPENAI_API_KEY / httpsCallable / firebase-functions dependency
- ASR model configured: onnx-community/whisper-tiny
- Local text model configured: onnx-community/Qwen2.5-0.5B-Instruct
- SENSOR A/B both must report Local ASR READY before measurement start

## NOT VERIFIED IN THIS ENVIRONMENT

The automated environment cannot perform the final real-device smoke test involving:
- Chrome/Edge WebGPU
- actual model download/cache
- microphone permissions and wired/wireless headset capture
- COOSPO HW9 Web Bluetooth
- real-time inference performance on the event PCs

Before event use, run one complete 3-PC session on the exact hardware and confirm transcription, AI TALK BONUS, result comment, and Records output.

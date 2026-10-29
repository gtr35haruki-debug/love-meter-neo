# TEST REPORT — LOVE METER NEO v0.4.0-beta.4

Date: 2026-10-29

## Automated tests
All bundled automated tests passed.

- EVENT child-support / questionnaire behavior: PASS
- EVENT_V2 questions / timing: PASS
- Heart metrics: PASS
- 1 Hz jitter regression: PASS
- skipped-question exclusion: PASS
- EVENT_V2 local-baseline / Question Response regression: PASS
- DISPLAY_SCORE_V3_PILOT regression: PASS
- Research export ZIP / privacy / UTF-8 / CRC: PASS
- Survey schema: PASS
- Voice baseline-relative metrics: PASS
- Dual-microphone A/B/BOTH/UNKNOWN/SILENCE classification: PASS
- AI transcript export privacy: PASS

## Not yet validated by automated test
The following still require physical/browser testing with the real setup:
- COOSPO HW9 x2 + SENSOR A/B + DISPLAY on three PCs
- actual wired microphone headset/earbud on one participant
- actual wireless microphone earbud/headset on the other participant
- browser microphone selection on the intended devices
- Bluetooth microphone latency behavior on the exact PCs/earbuds
- Firebase Functions deployment and real OpenAI API calls
- real noisy-event environment cross-talk and UNKNOWN rate

## Research caution
Passing software tests does not validate the scientific relationship between VOICE SCORE / AI TALK BONUS / NEO SCORE and relationship closeness. These remain beta experience/research hypotheses requiring new participant data.

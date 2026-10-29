# LOVE METER NEO v0.4.0-beta.4 — implementation notes

## Recommended physical setup
- Participant A: one-ear microphone-equipped earbud/headset -> SENSOR A PC.
- Participant B: one-ear microphone-equipped earbud/headset -> SENSOR B PC.
- Wired + wireless is allowed in the beta, but the exact device/connection type is recorded.
- Keep the microphone position as consistent as possible near the mouth.
- Use the in-app microphone selector and verify the displayed microphone name before baseline recording.

## Voice measurement flow
1. Connect HR sensors.
2. Select and connect each participant microphone.
3. Measure ambient noise and set each microphone's speech threshold.
4. Voice baseline A: 10 s, B silent.
5. Voice baseline B: 10 s, A silent.
6. Run Q1/Q2/Q3.
7. During questions, each SENSOR records local audio temporarily and computes 100 ms acoustic features; 200 ms features are saved.
8. A/B feature streams are aligned by session/phase elapsed time; browser-reported input latency is subtracted when available.
9. A/B/BOTH/UNKNOWN/SILENCE timeline is calculated.
10. Raw question audio is sent to transcription, then discarded by LOVE METER; text results are stored.
11. A/B transcripts are combined for AI TALK BONUS analysis.
12. Final display uses HEART + VOICE + capped AI TALK BONUS; AI result comment is presentation-only.

## Why pitch uses a personal baseline
Absolute F0 is not used as a direct 'reaction' score. Example:
- A: 120 -> 132 Hz = +10%
- B: 190 -> 202 Hz = +6.3%
Although both changed by +12 Hz, A changed more relative to their own baseline. UP and DOWN are stored separately and neither direction is automatically considered better.

## Five-state speaker classification
The system avoids assuming that 'SENSOR A heard it, therefore A spoke'. It compares both close microphones on the same time slice.
- A: A-side clearly dominant
- B: B-side clearly dominant
- BOTH: evidence suggests simultaneous speech
- UNKNOWN: insufficient/conflicting evidence
- SILENCE: neither channel passes its speech threshold

UNKNOWN is intentionally retained for scientific traceability.

## AI role
AI is intentionally secondary:
- transcription: converts each participant track to text
- AI TALK BONUS: small entertainment bonus from observable conversation features
- AI COMMENT: short result-screen comment only

AI is not the ground truth and is not allowed to infer romantic feeling or relationship quality directly.

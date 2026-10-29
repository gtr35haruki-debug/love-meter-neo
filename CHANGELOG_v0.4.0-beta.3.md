# LOVE METER NEO v0.4.0-beta.4

- Added 10-second per-participant VOICE BASELINE before measurement.
- Records microphone label, selected connection type (wired/wireless/unknown), sample rate and browser audio processing settings.
- Pitch Response now uses within-person change from baseline (Hz delta, percent delta, cents, z-like normalized delta, UP/DOWN/SAME) instead of comparing absolute pitch across participants.
- RMS change from baseline is saved in dB.
- Records screen shows microphone metadata, voice baseline and baseline-relative changes for every question.
- Research export now includes voice_baseline_A/B.json.
- Raw audio remains transient and is not stored in the LOVE METER database.

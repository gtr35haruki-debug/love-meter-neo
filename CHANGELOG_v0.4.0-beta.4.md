# LOVE METER NEO v0.4.0-beta.4

## Purpose
Integrates the DAIFESTA improvement plan discussed on 2026-10-29 into one beta build.

## Heart / score
- Keeps the EVENT_V2 Question Response local-baseline fix so Q1/Q2/Q3 can all contribute.
- Keeps DISPLAY_SCORE_V3_PILOT with the exploratory weights:
  - Direction 15%
  - Temporal 10%
  - Magnitude 10%
  - Question Response 25%
  - Balance 40%
- Keeps the previous score for comparison. V3 remains a pilot display score, not a validated relationship measure.

## Voice baseline
- Each participant must record a 10-second personal voice baseline before measurement.
- Baseline order is A -> B.
- Standard prompt: 「今日ここに来るまで、何をしていましたか？」
- The other participant should stay silent during the baseline.
- Stores baseline pitch mean/SD, RMS, speech ratio, quality and microphone metadata.
- Pitch reaction uses within-person relative change, not absolute pitch.
- Stores delta Hz, delta %, cents, z-score and UP/DOWN/SAME separately.

## Microphones
- Designed for one microphone-equipped earbud/headset per participant, worn on one ear.
- Supports one wired and one wireless microphone; connection type and actual microphone label are saved.
- Adds a microphone input selector so the browser does not silently keep using the laptop's built-in microphone.
- Stores browser-reported input latency and applied latency correction when available.
- echoCancellation, noiseSuppression and autoGainControl remain disabled for feature measurement.

## Dual-microphone speaker timeline
- A and B audio features are aligned on common session/phase elapsed time.
- 200 ms slices are classified as:
  - A
  - B
  - BOTH
  - UNKNOWN
  - SILENCE
- Ambiguous sound is kept as UNKNOWN instead of being forced to A or B.
- Uses per-microphone speech thresholds and relative signal strength to reduce sensitivity differences between wired/wireless microphones.
- Speech Balance and Turn Taking use the combined two-microphone timeline.

## Voice score beta
- Pitch Response
- Expressiveness
- Speech Balance
- Turn Taking
- VOICE SCORE beta is the mean of available voice submetrics and remains experimental.

## AI TALK BONUS
- Each participant's mouth-microphone audio is transcribed separately.
- A/B transcripts are combined only after transcription and are sent to AI as labeled participant tracks.
- AI evaluates observable conversation features only (question engagement, mutual response, self-disclosure, emotional expression, conversational richness).
- AI does not judge love, intimacy, compatibility, personality or relationship quality.
- AI TALK is only a small bonus, capped at +5 on the final experience score.
- Raw audio is not stored in the LOVE METER research database; transcripts and analysis results are stored.

## AI result comment
- AI reads the result values and generates one karaoke-style short comment.
- The comment is randomized within the result constraints.
- It never changes the score.
- It should not make definitive claims about romance/intimacy/compatibility.

## Records
The Voice / AI tab now shows:
- microphone connection type and actual microphone name
- baseline voice values
- browser-reported input latency / applied correction
- question-by-question delta Hz / delta % / cents / UP-DOWN-SAME
- Pitch Response / Expressiveness / Speech Balance / Turn Taking
- A/B/BOTH/UNKNOWN/SILENCE timeline
- 200 ms raw voice feature timeline
- A-side transcript and B-side transcript separately
- AI TALK analysis and bonus

## Research export
- Adds optional AI transcript export.
- AI transcripts remain excluded unless the free-text/AI-transcript export option is explicitly enabled.

## Important limitations
- Speaker classification is a beta heuristic, not biometric speaker identification.
- Bluetooth/input latency is corrected only when the browser reports a usable input-latency value; unsupported devices should be treated as timing-quality caution.
- Pitch estimation may be unavailable for laughter, whispering, overlap or noisy frames; unavailable values must remain NA rather than zero.
- VOICE SCORE, V3 heart weighting, AI TALK BONUS and final 70/30 experience weighting are experimental display values and require new validation data.

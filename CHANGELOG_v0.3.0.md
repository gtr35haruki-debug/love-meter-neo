# LOVE METER NEO v0.3.0 — EVENT_V2 / CHILD_SUPPORT_V1

2026-08-28 event build.

## Event question bank

- Added `QUESTION_BANK_EVENT_V2`.
- Five event categories: 初対面 / 友達 / 親子 / 兄弟・姉妹 / 夫婦.
- Each category has Set A/B/C × 3 questions = 9 questions (45 total).
- One EVENT_V2 session uses one 3-question set.
- `EVENT_V2` keeps the existing 120-second measurement timing: BASE 30s, Q1 20s, RESET 10s, Q2 20s, RESET 10s, Q3 20s, RECOVERY 10s.

## Child support

- Added `CHILD_SUPPORT_V1` as an event display/operation aid; it does **not** use a separate question bank.
- Same EVENT_V2 questions and timing are used for adult-child, child-child, and ordinary event sessions.
- Added larger/simpler participant display, child-friendly intro/result wording, and quiet measurement presentation.
- Added staff read-aloud prompts for each live question.
- Added parent/staff condition check for recent running, heat/cold discomfort, and sensor discomfort.
- Sensor pain/discomfort blocks measurement start until resolved.

## Question skip

- Staff/controller can skip a question in EVENT_V2.
- The shared 20-second phase clock is not shortened; the display waits until the next scheduled phase.
- The skipped question remains recorded in raw data/audit logs but is excluded from per-question/session metric aggregation.
- Records explicitly show `QUESTION_SKIPPED`.

## Child questionnaire

- Added `EVENT_CHILD_Q_V1` with four items and four large face choices:
  - ちがう = 0
  - すこし = 1
  - そう！ = 2
  - わからない = `null`
- Session setup can target Participant A, Participant B, or both for the child questionnaire.
- Child questionnaire data is stored separately and must not be treated as the same scale as RESEARCH_V1 R1–R8.

## Participant guide

- Added EVENT_V2 introduction explaining what LOVE METER NEO does and that NEO SCORE is an experience score, not a friendship/compatibility diagnosis.
- Added child-friendly introduction for CHILD_SUPPORT_V1.
- RESEARCH_V1 intro wording was clarified without changing its questions, timing, metrics, or score calculation.

## Unchanged in this release

- RESEARCH_V1 question bank
- Heart-rate preprocessing / 1 Hz pilot correction
- Five scientific metric formulas
- NEO SCORE V2 pilot formula and display calibration
- EVENT measurement timing

## Stored versions

New EVENT_V2 sessions record:
- `protocolId = EVENT_V2`
- `questionBankVersion = QUESTION_BANK_EVENT_V2`
- `childSupportVersion = CHILD_SUPPORT_V1` when enabled
- `childQuestionnaireVersion = EVENT_CHILD_Q_V1` when enabled
- `eventGuideVersion = EVENT_GUIDE_V2`

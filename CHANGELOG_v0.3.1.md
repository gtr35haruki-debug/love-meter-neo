# CHANGELOG v0.3.1 — Event Refined

Date: 2026-08-28

## Event mode
- `恋人` category added to EVENT_V2.
- Event question bank now contains 6 categories × 3 sets × 3 questions = 54 questions.
- Event question bank version bumped to `QUESTION_BANK_EVENT_V3`.
- Child Support mode removed from session creation, display, operator UI, result UI, Records, and public display metadata.
- Event/child questionnaires removed. EVENT_V2 now goes directly from measurement end to result calculation.
- Question skip remains available to the controller during every EVENT_V2 question.
- A skipped question remains in RAW/audit history but is excluded from question/session metric aggregation. The shared 120-second timeline is not shortened.

## Unchanged
- RESEARCH_V1 questionnaire and research workflow.
- EVENT_V2 timing: BASE 30s / Q1 20s / RESET 10s / Q2 20s / RESET 10s / Q3 20s / RECOVERY 10s.
- Five research metrics and NEO SCORE calculation.

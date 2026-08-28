# LOVE METER NEO v0.3.0 Test Report

Date: 2026-08-28

## Automated/static checks passed

- `node --check` for every JavaScript file under `src/`
- Existing metrics tests
- Existing 1 Hz jitter regression test
- EVENT_V2 question-bank test
  - 5 categories
  - A/B/C sets
  - 3 questions per set
  - 45 questions total
  - 120-second EVENT_V2 timeline
- EVENT_CHILD_Q_V1 schema test
- Skipped-question metric exclusion regression test
- CSS brace balance check

## Important remaining real-device checks

The container cannot reproduce the actual event hardware environment. Before live use, run one full 3-PC test with the two COOSPO HW9 sensors and Firebase/GitHub Pages. In particular verify:

1. EVENT_V2 session creation and 6-digit joining on all 3 PCs.
2. Both real HW9 streams become READY.
3. Child-support condition check and start blocking for sensor discomfort.
4. Staff read-aloud helper appears during all three questions.
5. Question skip is reflected on DISPLAY and does not jump the shared timeline.
6. Selected child questionnaire side(s) can answer all four questions.
7. `わからない` is saved as null, not zero.
8. Result is calculated after the required child questionnaire(s).
9. Records show EVENT_V2, CHILD_SUPPORT version, questionnaire version, and skipped question(s).
10. GitHub Pages cache is refreshed and APP 0.3.0 is shown on every PC.

No change was made to the existing five metric formulas, pilot display-score formula, RESEARCH_V1 question bank, or EVENT measurement timing.

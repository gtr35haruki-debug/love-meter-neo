# TEST REPORT v0.4.0-beta.2

Date: 2026-10-29
APP_VERSION: 0.4.0-beta.2

## Static syntax checks
- src/*.js: PASS
- functions/index.js: PASS

## Automated tests
- event-child-support.test.mjs: PASS
- event-v2.test.mjs: PASS
- metrics.test.mjs: PASS
  - 1 Hz jitter regression: PASS
  - skipped-question exclusion: PASS
  - EVENT_V2 Q2/Q3 local-baseline regression: PASS
  - DISPLAY_SCORE_V3_PILOT regression: PASS
- research-export.test.mjs: PASS
- survey-schema.test.mjs: PASS
- voice.test.mjs: PASS
  - voice summary: PASS
  - speech balance: PASS
  - turn-taking: PASS
  - session voice score: PASS

## Not automatically tested in this container
- Real HW9 Bluetooth connection
- Real browser microphone permission/recording on the target PCs
- Firebase deployment
- OpenAI API call with the user's API key
- Same-room microphone cross-talk under the actual event environment

These require an on-device smoke test before DAIFESTA use.

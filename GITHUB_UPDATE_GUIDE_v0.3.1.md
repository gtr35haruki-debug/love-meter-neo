# GitHub update guide — v0.3.1

Replace the current GitHub Pages files with the files in the update-only ZIP, keeping the same paths.

Required replacements:
- `src/app.js`
- `src/config.js`
- `src/question-bank.js`
- `src/survey-schema.js`
- `src/firebase-backend.js`
- `tests/event-v2.test.mjs`
- `tests/survey-schema.test.mjs`
- `README.md`
- `CHANGELOG_v0.3.1.md`

After commit, open GitHub Pages and hard reload (Ctrl+Shift+R). Confirm APP 0.3.1, EVENT categories include 恋人, there is no child-support/event questionnaire UI, and the controller sees 「この質問をスキップ」 during each EVENT question.

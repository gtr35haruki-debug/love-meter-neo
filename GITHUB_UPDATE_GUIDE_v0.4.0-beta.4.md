# GitHub / Firebase update guide — v0.4.0-beta.4

## Files that changed materially
- `src/config.js`
- `src/voice.js`
- `src/ai.js`
- `src/app.js`
- `src/backend.js`
- `src/firebase-backend.js`
- `src/local-backend.js`
- `src/research-export.js`
- `functions/index.js`
- `database.rules.production.json`
- `styles.css`
- voice/export tests

## Firebase Functions
The beta adds two callable functions:
- `transcribeParticipantAudio`
- `analyzeConversationTranscripts`

The existing `generateResultComment` remains in use. `OPENAI_API_KEY` must remain a server-side Firebase secret; do not place an API key in browser code.

## Database
New research path:
- `ai_talk_transcripts/{sessionId}/{questionIndex}/{A|B}`

Existing paths used:
- `voice_baseline/...`
- `voice_features/...`
- `ai_talk_analysis/...`

If production rules are deployed, deploy the included updated rules as well.

## Before an event
1. Open all three PCs on the same app version.
2. Connect the intended microphone on SENSOR A and SENSOR B.
3. Use the in-app microphone selector and verify the displayed mic name.
4. Confirm connection type (wired/wireless).
5. Measure baseline A for 10 s while B is silent.
6. Measure baseline B for 10 s while A is silent.
7. Run one complete test session and inspect Records > Voice / AI.
8. Confirm both A and B transcripts appear and the speaker timeline contains sensible A/B/BOTH/UNKNOWN/SILENCE values.

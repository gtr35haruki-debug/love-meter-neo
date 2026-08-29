export const APP_VERSION = '0.3.1';
export const QUESTION_BANK_VERSION = 'QUESTION_BANK_V1';
export const EVENT_QUESTION_BANK_VERSION = 'QUESTION_BANK_EVENT_V3';
export const EVENT_GUIDE_VERSION = 'EVENT_GUIDE_V2';
export const CONSENT_VERSION = 'CONSENT_V1';
export const PREPROCESSING_VERSION = 'PREPROCESSING_V1_1_PILOT';
export const METRICS_VERSION = 'METRICS_V1_1_PILOT';
export const DISPLAY_SCORE_VERSION = 'DISPLAY_SCORE_V2_PILOT';
export const DISPLAY_SCALE_VERSION = 'DISPLAY_SCALE_PILOT_20260824_V1';

export const CONFIG = {
  backendMode: 'firebase',
  // Current Spark-plan development build: the UI gate checks a salted SHA-256 hash in the browser.
  // This is deliberately marked development-only. Production will switch to cloud-function mode.
  adminGateMode: 'client-dev-hash',
  recordsPinHash: 'd9e8ba268f9395349dacf6f12bba3ddd75540d5a788000a684c895456d68bb89',
  recordsPinHashPrefix: 'love-meter-neo-records-v1:',
  securityMode: 'development-authenticated',
  rolePersistence: false,
  sessionJoinCodeLength: 6,
  controllerStartLeadMs: 3000,
  targetClockSkewMs: 500,
  recordsIdleLockMs: 30 * 60 * 1000,
  sensorStreamValidationSamples: 3,
  sensorStreamValidationWindowMs: 7000,
  graphGapMs: 1800,
  metrics: {
    smoothingWindowSec: 3,
    deltaIntervalSec: 3,
    directionThresholdBpm: 2,
    researchQuestionValidSeconds: 32,
    researchDirectionActiveMinSeconds: 8,
    temporalMaxLagSec: 4,
    temporalValidSeconds: 32,
    temporalContinuousGapInvalidSec: 5,
    sessionContinuousGapCautionSec: 5,
    oneHzNearestToleranceMs: 650,
    balanceEpsilon: 0.5,
    localBaselineSeconds: 15,
    localBaselineValidSeconds: 12,
    qcGood: 0.9,
    qcCaution: 0.8,
  },
  displayScalePilot: {
    // 2026-08-20 / 08-24 pilot: GOOD sessions only, question-level robust anchors.
    // p10 -> 30, p50 -> 60, p90 -> 90. Research raw metrics are never replaced by these display values.
    anchors: {
      direction: { p10: 2.9166666667, p50: 19.2307692308, p90: 31.25 },
      temporal: { p10: 0.0598474561, p50: 0.2328093504, p90: 0.5107096715 },
      magnitude: { p10: -1.1461039886, p50: 0.0970797721, p90: 1.0475 },
      questionResponse: { p10: 0.6440789474, p50: 2.4916666667, p90: 5.0208333333 },
    },
    weights: {
      direction: 0.30,
      temporal: 0.20,
      magnitude: 0.20,
      questionResponse: 0.30,
    },
  },
  firebase: {
    apiKey: 'AIzaSyByFvnkQIbnz2XbZMQOABmGUFa7MyvsiMg',
    authDomain: 'love-meter-neo-58978.firebaseapp.com',
    databaseURL: 'https://love-meter-neo-58978-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'love-meter-neo-58978',
    storageBucket: 'love-meter-neo-58978.firebasestorage.app',
    messagingSenderId: '154380221711',
    appId: '1:154380221711:web:27c1c99553d8ae605f927a',
    measurementId: 'G-HEG00PZPP8',
  },
};

export const ROLE = Object.freeze({
  DISPLAY: 'DISPLAY',
  SENSOR_A: 'SENSOR_A',
  SENSOR_B: 'SENSOR_B',
  RECORDS: 'RECORDS',
});

export const SESSION_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  READY: 'READY',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  SYNC_PENDING: 'SYNC_PENDING',
  COMPLETE: 'COMPLETE',
  ABORTED: 'ABORTED',
});

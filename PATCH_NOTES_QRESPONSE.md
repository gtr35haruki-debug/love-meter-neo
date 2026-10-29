# LOVE METER NEO – Question Response baseline fix candidate

Scope: calculation fix only. No UI, protocol duration, score weights, or Balance formula changes.

## Problem
EVENT_V2 uses 10-second RESET phases before Q2/Q3, while Question Response required a fixed 12 valid seconds for the local baseline. Therefore Q2/Q3 were always `LOCAL_BASELINE_INVALID` by construction.

Observed on the 90-session analysis set (6 specified exclusions applied):
- EVENT_V2 sessions: 68
- Before fix: Q1 68/68 valid, Q2 0/68 valid, Q3 0/68 valid

## Fix
Use 80% coverage of the actually available local-baseline window, capped at the existing 12-second requirement.
- 15-second local window -> requires 12 seconds (unchanged for RESEARCH_V1 / Q1)
- 10-second local window -> requires 8 seconds (EVENT_V2 Q2/Q3)

## Verification
After fix on the same 68 EVENT_V2 sessions:
- Q1 68/68 valid
- Q2 68/68 valid
- Q3 68/68 valid

Existing metric tests and a new EVENT_V2 regression test all pass.

## Balance
No Balance formula change in this patch. In current v0.3.4, `NO_REACTION` already returns `null` and is excluded from the session median. A valid Balance of 0 means one side showed reaction above baseline while the other did not; this is not the same as an invalid value.

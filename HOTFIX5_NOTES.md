# HOTFIX5

- Fixed JavaScript syntax error in `src/app.js` around line 484.
- Cause: a single-quoted alert string contained a raw newline.
- Replaced the raw newline with `\n`.
- Bumped browser cache-busting token from `0.4.0b5h4` to `0.4.0b5h5`.
- `node --check` passed for all files under `src/`.
- All 7 existing Node test files passed.

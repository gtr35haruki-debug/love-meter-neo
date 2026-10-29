# v0.4.0-beta.5 HOTFIX7

- AI result comment quality guard added.
- Rejects repeated numbers/phrases, unexpected uppercase tokens, too little Japanese, and low-diversity gibberish.
- Rejected comments fall back to safe score-aware Japanese comments.
- AI TALK analysis validates JSON schema/ranges and retries once with a simpler prompt.
- Invalid AI TALK output receives 0 bonus and stores an explicit failure code/reason.
- Result screen distinguishes AI-generated comments from fallback comments.
- Records shows accepted/rejected AI analyses and failure reasons.

## Build Report — Task 002: Security Hardening — Update hardcoded Claude model to env var
- Commit: 8a10b62
- Tests: 5/5 passing (security-claude.test.ts)
- Wiring Proof: 5/5 checks passed
  1. CLI: grep confirms no claude-3-opus-20240229 in src/, ANTHROPIC_MODEL in claude.ts
  2. Import invocation: fetchFromClaudeDirect called from processDocumentWithClaude (line 225)
  3. Pipeline: env var read at runtime in fetchFromClaudeDirect payload construction
  4. Error boundaries: fallback default 'claude-opus-4-6' prevents undefined model
  5. Dependencies: no new dependencies
- New Files: none
- Modified Files:
  - src/lib/claude.ts (replaced hardcoded model with env var)
  - .env.example (added ANTHROPIC_MODEL entry)
  - tests/security-claude.test.ts (added 2 new test cases)
- Dependencies Added: none
- Notes:
  - anthropic-fetch.ts also has a hardcoded model (claude-3-7-sonnet-20250219) but that is out of scope for this task — task only targets claude-3-opus-20240229 in fetchFromClaudeDirect
  - Pre-flight advisory about SIGN-003 addressed: tests read the actual source file and verify the exact env var pattern

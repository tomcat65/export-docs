# Lessons Learned

## 2026-03-07 — BOL Upload Timeout Fix

### Mongoose strict:true silently drops unknown fields
- If a field isn't in the schema, `Document.create()` silently discards it
- Always verify schema has every field you're writing
- Use `Schema.Types.Mixed` for dynamic data, not ad-hoc object properties

### Mongoose enum validation on create
- Schema `enum` values are enforced on `Document.create()`
- Writing an invalid status like `'processed'` when enum is `['active', 'superseded']` causes ValidationError
- Keep enum definitions in sync with all code paths that write status

### Vercel Hobby plan: 10-second serverless function timeout
- Any server-side Claude/Firebase processing will timeout (30-60s typical)
- Solution: process on client-side (Firebase direct call), save results via lightweight API
- ALL paths must be checked — including replace/update flows, not just the happy path

### Retry stacking across layers
- Library retries × component retries = multiplicative attempts
- Put retries in ONE layer only — the one closest to the user (component)
- Libraries should be single-call-and-throw for debuggability

### Don't log credentials
- `console.log` of MongoDB URI, emails, etc. goes to Vercel function logs
- Vercel logs are accessible to all team members by default
- Gate verbose logging behind `NODE_ENV === 'development'`

### Mongoose `type` key collision in subdocuments
- If a subdocument has a field named `type`, Mongoose interprets it as the schema type declaration
- `{ type: String }` means "this field is a String" — not "a field called type with value String"
- Fix: wrap as `{ type: { type: String } }` to tell Mongoose it's a regular field
- Symptom: `Cast to [string] failed` when trying to save objects in an array

### Codex audit cycle
- Send code for audit → fix findings → re-audit until no HIGH findings
- Codex catches: orphan cleanup, bypass paths, enum mismatches, validation gaps
- Always request validation of fixes, don't assume they're correct

# SPECTRA Builder Memory — docu-export

## Project Patterns
- Next.js 15 App Router project with TypeScript strict mode
- Mongoose for MongoDB, TanStack Query for client-side data fetching
- `functions/` dir has its own tsconfig.json — excluded from root tsconfig

## Lessons Learned
- **Verify baseline before coding**: `npx tsc --noEmit` checks ALL project files. Pre-existing TS errors (63 in this case) will fail verify commands even if task-owned files are clean. Always check baseline first.
- **functions/ exclusion**: The `functions/` dir uses Firebase deps not installed at root. Must be excluded from root tsconfig.
- **IDocument type gaps**: The Mongoose `IDocument` interface lacks some fields used at runtime (`dateOfIssue` at top level, `commodity` in bolData, `customFields`). These are accessed via `as any` casts.

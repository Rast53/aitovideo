# Plan: Shared progress across platforms (Issue #36)

## Problem
Progress is stored per `video_id`. When a user watches 20 min on YouTube (id=5),
then opens VK version (id=8, parent_id=5), progress starts from 0.

## Architecture
`videos` table already has `parent_id` — YouTube is the parent, VK/Rutube are children.
One "family" = parent + all children sharing `parent_id`.

## Solution: canonical_id
Introduce concept of `canonical_id` — the root of the family tree.
- If video has `parent_id` → canonical = parent_id
- If video has no `parent_id` → canonical = its own id

Progress is always read/written by `canonical_id`, not `video_id`.

## Steps

### Step 1 — Backend: helper function `getCanonicalId(videoId)`
File: `backend/src/models/video.ts` (or inline in progress.ts)

```typescript
function getCanonicalId(db: Database, videoId: number): number {
  const row = db.prepare('SELECT parent_id FROM videos WHERE id = ?').get(videoId) as { parent_id: number | null } | undefined;
  return row?.parent_id ?? videoId;
}
```

Commit: `feat: step 1 of #36 — getCanonicalId helper`

### Step 2 — Backend: update GET /api/progress/:video_id
File: `backend/src/api/routes/progress.ts`

Change the SELECT query:
```sql
-- Before
SELECT * FROM video_progress WHERE user_id = ? AND video_id = ?

-- After
SELECT * FROM video_progress WHERE user_id = ? AND video_id = ?  (using canonicalId)
```

Pass `canonicalId` instead of raw `videoId`:
```typescript
const canonicalId = getCanonicalId(db, videoId);
const progress = db.prepare('SELECT * FROM video_progress WHERE user_id = ? AND video_id = ?')
  .get(user.id, canonicalId);
```

Commit: `feat: step 2 of #36 — GET progress uses canonicalId`

### Step 3 — Backend: update POST /api/progress
File: `backend/src/api/routes/progress.ts`

Same pattern — resolve canonicalId before upsert:
```typescript
const canonicalId = getCanonicalId(db, video_id);
// verify canonical video exists and belongs to user
// upsert with canonicalId
```

⚠️ The ownership check must use the ORIGINAL `video_id` (user owns the child video),
but the progress upsert uses `canonicalId`.

Commit: `feat: step 3 of #36 — POST progress uses canonicalId`

### Step 4 — Frontend: no changes needed
Progress API calls already send `video.id` — backend now resolves canonical transparently.
The Player component doesn't need modification.

### Step 5 — Verification
```bash
./scripts/check.sh  # must pass
```

Manual test scenario:
1. Watch YouTube video to 20min → progress saved
2. Open VK version (child) → should resume from 20min
3. Watch to 25min on VK → progress updated
4. Open Rutube version → should start from 25min

## Files touched
- `backend/src/api/routes/progress.ts` — GET and POST handlers
- `backend/src/models/video.ts` OR inline helper in progress.ts (agent decides)

## Constraints
- No DB schema changes — `video_progress` table unchanged
- No frontend changes
- `./scripts/check.sh` must pass
- No `console.log` — use `dbLogger` if logging needed

## Risks
- Edge case: video with parent_id but parent doesn't exist (deleted) → fall back to own id
- Handle gracefully in `getCanonicalId`

## Acceptance criteria
- [ ] GET progress for child video returns parent's progress
- [ ] POST progress for child video updates parent's progress record
- [ ] Watching child video to T minutes → opening another child → resumes from T
- [ ] check.sh passes

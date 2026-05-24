# API — Story Requests

Anonymous reader-submission flow. Inserts go via service-role (no anon INSERT policy on `story_requests`), so honeypot, rate-limit, and dedupe logic live here.

---

## POST `/api/requests`

**File:** [app/api/requests/route.ts](../../app/api/requests/route.ts)

Submit a request for a new story OR for a new translation of an existing story.

### Request

```jsonc
{
  "type": "new_story" | "new_variant",
  "storyId": "uuid",                 // required when type === "new_variant"
  "requestedTitle": "The Bet",       // required when type === "new_story"
  "requestedAuthor": "Anton Chekhov", // optional
  "targetLanguage": "ur",            // language code, optional
  "toneId": "uuid",                  // optional — "no preference" when omitted
  "notes": "...",                    // optional free text
  "requesterEmail": "you@example.com", // optional
  "hp": ""                            // honeypot — MUST be empty
}
```

### Response — success

```jsonc
// New row created
{ "ok": true, "matched": false, "requestId": "uuid" }

// Matched an existing OPEN request → its votes were bumped
{ "ok": true, "matched": true,  "requestId": "uuid" }
```

### Response — rejection

| HTTP | Reason |
|---|---|
| 400 | Missing required fields or invalid `type` |
| 429 | IP rate-limited (5 submissions per hour per IP) |
| 500 | DB insert failure |

The honeypot path returns a fake success (`{ ok: true, matched: false }`) so bots can't tell the field was a trap.

### Side effects

1. Per-IP rate-limit check ([lib/requests/rate-limit.ts](../../lib/requests/rate-limit.ts)) — sliding window, 5/hr.
2. Dedupe lookup: scans `story_requests` for an `OPEN` row with the same `type + story_id + target_language + tone_id` (and, for new-story requests, fuzzy title match). On match, inserts a `story_request_votes` row keyed by `sha256(ip+salt)` and bumps `votes` (unless that IP already voted).
3. Otherwise inserts a new `story_requests` row + records the submitter's vote.

---

## POST `/api/requests/[id]/vote`

**File:** [app/api/requests/[id]/vote/route.ts](../../app/api/requests/[id]/vote/route.ts)

Upvote an existing public request.

### Request

No body. Path param: the request id.

### Response

```jsonc
// New vote recorded
{ "ok": true, "alreadyVoted": false, "votes": 7 }

// Same IP already voted (idempotent)
{ "ok": true, "alreadyVoted": true,  "votes": 6 }
```

| HTTP | Reason |
|---|---|
| 404 | Request not found |
| 409 | Request is closed (`fulfilled` or `declined`) |
| 429 | IP rate-limited (30 votes/hr) |

### Side effects

Insert into `story_request_votes (request_id, voter_hash=sha256(ip+salt))`. Duplicate insert throws Postgres `23505` which the handler translates to `alreadyVoted: true`. On a fresh vote, `story_requests.votes` is incremented.

---

## Why service-role behind an API route (not anon RLS)

- Spam controls (honeypot, rate-limit, fuzzy dedupe) are simpler in app code than RLS.
- Open requests are kept private — competing reader teams can't scrape pending demand.
- All admin reads of `story_requests` also go through service-role ([app/admin/(protected)/requests/page.tsx](../../app/admin/(protected)/requests/page.tsx)).

See [04-database.md §4.12–§4.13](../04-database.md#412-story_requests) for the table schemas.

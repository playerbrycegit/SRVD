# SRVD — API Reference

Base URL: same origin as the web client in production (relative paths). In local dev the API runs on
`http://localhost:4001`.

**Auth model:** bearer-token sessions. Send `Authorization: Bearer <token>` on protected routes.
Every route except `/health`, `/auth/*`, and `/alpha/accept-invitation` requires a valid session
(single chokepoint in `server.ts`). Unauthorized requests to protected routes return `401`.

**Response envelope:** success responses return `{ "data": ... }`; errors return
`{ "error": { "message": ..., "field": ... } }`. Validation failures return `400`; server errors
return `500` with no internal detail leaked.

## Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness check. Returns `{ data: { status: "ok" } }`. |

## Auth

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | none | Create account (email + password). Triggers verification email. |
| POST | `/auth/verify-email` | none | Verify account with the emailed token. |
| POST | `/auth/request-password-reset` | none | Request a password-reset email. |
| POST | `/auth/reset-password` | none | Reset password with token; revokes existing sessions. |
| POST | `/auth/login` | none | Authenticate; returns a session token. |
| POST | `/auth/logout` | token | Revoke the current session. |
| POST | `/auth/delete-account` | session | Permanently delete the authenticated account. |

## Shifts & goals

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/shifts` | session | Create a shift (date, hours, cash tips, card tips). |
| GET | `/shifts` | session | List the user's shifts. |
| GET | `/shifts/stats` | session | Aggregate earnings stats. |
| PATCH | `/shifts/:id` | session | Edit a shift (ownership-scoped). |
| DELETE | `/shifts/:id` | session | Delete a shift (ownership-scoped). |
| POST | `/goals` | session | Set a weekly earnings goal. |
| GET | `/goals` | session | Get the current goal. |

## Recipes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/recipes` | session | Create a recipe with ingredients. |
| GET | `/recipes` | session | List/search recipes (`?search=`, `?category=`). |
| GET | `/recipes/:id` | session | Get one recipe. |
| PATCH | `/recipes/:id` | session | Edit a recipe; replaces ingredients transactionally. |
| DELETE | `/recipes/:id` | session | Delete a recipe (ownership-scoped). |

## Tools (stateless calculators)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/tools/batch` | session | Batch-scale a recipe. |
| POST | `/tools/abv` | session | ABV/proof calculation. |
| POST | `/tools/convert` | session | Unit conversion. |

## Settings

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/settings` | session | Get preferences. |
| PATCH | `/settings` | session | Update preferences. |
| GET | `/settings/sessions` | session | List active sessions. |
| DELETE | `/settings/sessions/:id` | session | Revoke one session. |
| POST | `/settings/sessions/revoke-all` | session | Revoke all other sessions. |
| GET | `/settings/export` | session | Export the user's data (stricter rate-limit tier). |

## Beta operations

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/alpha/invite` | session | Create a beta invitation. |
| POST | `/alpha/accept-invitation` | none | Accept an invitation. |
| POST | `/alpha/feedback` | session | Submit feedback (validated, token-redacted). |
| GET | `/alpha/feedback` | session | List feedback (admin). |

## Rate limiting

Auth-sensitive routes are rate-limited; `/settings/export` has its own stricter tier. Exceeding a
limit returns `429`.

## Notes

- Request/response field-level shapes are defined and enforced by the validation layer in
  `src/shared-kernel/validation`. Refer to that module (and the module services) for exact fields.
- All money and private free-text values are excluded from analytics/logging by design.

# Security and UX implementation plan

The active video provider is YouTube. Existing local changes are preserved.

- [x] Close license account takeover and private-cover access; consolidate authentication limits and audit events.
- [x] Make login sessions revocable using the existing Session table; enforce device and lesson access on playback and progress.
- [x] Stabilize the YouTube player, restore saved progress, and recover cleanly from network failures.
- [x] Correct admin editing context, analytics, draft previews, and learner navigation.
- [x] Add regression coverage, run type checking, lint, tests, and a production build.

Verification (2026-09-08):
- `npm test`: 28 regression tests passed. Source is executed with explicit database/network substitutes; no production data is used.
- `tsc --noEmit --incremental false`: passed.
- `eslint . --no-cache`: passed without warnings.
- `npm run build -- --webpack`: passed. Public Google Fonts required network access; database URLs were overridden with an unreachable local test endpoint.
- Production HTTP smoke checks: home/login/admin-login return 200; library redirects to login; unauthenticated playback/progress/devices return 401; the retired binding preflight returns 410; Auth.js providers and production security headers are available.
- Authenticated flows and YouTube callback behavior were tested with substitutes, not against a real shop, account, or production video.

Deployment considerations:
- Existing login cookies must authenticate again because they do not have a server session record.
- WordPress license status is rechecked on login and at most every five minutes during protected course use. Upstream failures deny uncached access without permanently revoking the license.
- YouTube links remain shareable outside this application; application sessions cannot provide DRM for YouTube.
- No production database mutations or hosting deployment are part of local verification.
- Purge any existing CDN cache for `/api/cover` when deploying the fix; previously cached private responses cannot be recalled by changing handler code alone.
- For reliable completion percentages, enter each YouTube lesson's duration in the admin form. When no duration is stored, the player supplies it; this is not independent proof of viewing.

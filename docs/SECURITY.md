# Security

ANVAYA is a public camera-to-Gemini demo. The main abuse risk is **someone draining your Gemini quota**. Controls below assume a **single** API instance (Render free/standard).

## What is in code

| Control | Detail |
|---|---|
| API key | `GEMINI_API_KEY` lives only in backend env. Never `NEXT_PUBLIC_*`. |
| Photos | Multipart upload → RAM → Gemini → discarded. Not written to disk. |
| CORS | Exact origin allowlist. Production **refuses to start** if `CORS_ORIGINS` is missing or `*`. |
| Rate limits | Per IP: 10/min, 40/hour, 100/day (override via env). |
| Global budget | 100 `/analyze` calls per process per day. Protects the key if IPs are rotated. |
| Concurrency | At most 2 Gemini calls at once; extras get HTTP 429. |
| Upload cap | 8 MB + `Content-Length` pre-check. |
| Magic bytes | JPEG/PNG/WebP/GIF signatures required. A renamed `.exe` is rejected. |
| Swagger | `/docs` and OpenAPI are **off** when `ENVIRONMENT=production`. |
| Errors | Production returns generic 502/500 messages, not stack traces. |
| Client IP | Uses the **last** `X-Forwarded-For` hop (the one your host adds). Uvicorn `--proxy-headers` is on in Docker. |
| Headers | `nosniff`, `DENY` framing, no-referrer, no-store on the API; CSP + HSTS + Permissions-Policy on the UI. |

## Operator checklist before go-live

1. Rotate `GEMINI_API_KEY` if it was ever pasted into chat, a slide, or a public issue.
2. Set `ENVIRONMENT=production`.
3. Set `CORS_ORIGINS` to the exact Vercel origin, e.g. `https://anvaya.vercel.app` (no trailing slash).
4. Confirm `/health` shows `"gemini_configured": true` and `/docs` is **404**.
5. Tighten `RATE_LIMIT_*` / `GLOBAL_DAILY_ANALYZE_LIMIT` if the demo is linked publicly.

## Residual risk (honest)

- Limits are **in memory**. A restart resets the counters.
- Multiple API replicas do **not** share quotas. Stay on one instance, or put a gateway in front.
- Determined attackers can still cost you money until the global daily cap hits. For a long-lived product, add auth, a paid gateway, and billing alerts on Google AI Studio.
- Gemini can be prompt-injected via the photo. The system prompt forbids medical/legal advice; it is not a guarantee.

## What ANVAYA does not claim

- Guaranteed hazard detection (stairs, traffic, platforms).
- Prescription or dosage interpretation.
- Legal or financial advice from a photo of a document.

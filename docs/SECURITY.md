# Security & responsible AI (ANVAYA)

## Threat model (hackathon MVP)

| Asset | Risk | Mitigation in code |
|---|---|---|
| Gemini API key | Leak via frontend / repo | Key only on backend env; never `NEXT_PUBLIC_*` |
| User photos (bills, labels) | Storage / retention | Processed in RAM only; not written to disk |
| Abuse of `/analyze` | Cost / DoS | Per-IP rate limit; 8 MB max; type allowlist; question length cap |
| Browser XSS / clickjacking | UI abuse | Security headers on API + Next.js (`nosniff`, `DENY` frame, etc.) |
| Error leakage | Stack traces to clients | `ENVIRONMENT=production` returns generic 502/500 messages |
| Cross-origin abuse | Foreign sites calling API | CORS allowlist via `CORS_ORIGINS` |

## Data handling

- Images: multipart upload → memory → Gemini → discarded.
- No database, no object storage, no auth cookies for the MVP.
- Disclaimer returned on every analysis: not medical advice, not a safety system.

## What we do **not** claim

- Guaranteed hazard detection (stairs, traffic, platforms).
- Prescription / dosage interpretation.
- Legal or financial advice from document OCR.

## Operator checklist

1. Rotate `GEMINI_API_KEY` if it was ever pasted into chat, slides, or a public issue.
2. Keep `CORS_ORIGINS` tight to your Vercel domain(s).
3. Prefer production deploy over exposing a laptop tunnel with a key.
4. For a post-hackathon product: add auth, signed upload URLs, durable audit logs, and a DPA with the vision provider.

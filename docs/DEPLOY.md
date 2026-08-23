# Deploy ANVAYA

Camera and microphone **need HTTPS** (or localhost). A phone will not get camera access on a LAN `http://` URL.

## Architecture

```text
Phone / laptop (HTTPS)
    → Vercel (Next.js)
        → Render (FastAPI + GEMINI_API_KEY)
            → Google Gemini 2.5 Flash
```

## 1. Backend — Render (Docker)

1. Push this repo to GitHub.
2. [Render](https://render.com) → New → Blueprint or Web Service.
3. Root / Dockerfile: **`backend`**.
4. Health check: `/health`
5. Environment:

| Key | Value |
|---|---|
| `GEMINI_API_KEY` | from [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `ENVIRONMENT` | `production` |
| `CORS_ORIGINS` | exact Vercel origin, e.g. `https://anvaya.vercel.app` (no trailing slash) |
| `RATE_LIMIT_PER_MINUTE` | `10` |
| `RATE_LIMIT_PER_HOUR` | `40` |
| `RATE_LIMIT_PER_DAY` | `100` |
| `GLOBAL_DAILY_ANALYZE_LIMIT` | `100` |
| `MAX_CONCURRENT_ANALYZE` | `2` |

6. Check `https://YOUR-API.onrender.com/health` → `"gemini_configured": true`
7. Check `https://YOUR-API.onrender.com/docs` → **404** in production (expected).

Render free tier sleeps. Hit `/health` about two minutes before a demo.

### Local Docker smoke test

```bash
cd backend
docker build -t anvaya-api .
docker run --rm -p 8000:8000 \
  -e GEMINI_API_KEY=your_key \
  -e CORS_ORIGINS=http://localhost:3000 \
  -e ENVIRONMENT=production \
  anvaya-api
```

## 2. Frontend — Vercel

1. [Vercel](https://vercel.com) → Import repo → **Root Directory: `frontend`**
2. Environment (Production + Preview):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://YOUR-API.onrender.com` |

3. Deploy. Open the Vercel HTTPS URL on a phone. Allow camera + mic.
4. If the Vercel URL changed, update Render `CORS_ORIGINS` and redeploy the API.

## 3. After deploy

1. Use Chrome for Talk / speech recognition.
2. Tap **Talk**, hold a bill, say what you need. Say **okay bye** to stop.
3. Confirm a second rapid burst of captures returns a wait message (rate limit), not a new Gemini bill.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Camera blocked | Must be HTTPS or localhost |
| CORS error in the browser console | Exact Vercel origin in `CORS_ORIGINS` |
| API process exits on boot | `CORS_ORIGINS` missing or set to `*` in production |
| `gemini_configured: false` | Set `GEMINI_API_KEY` on Render |
| Speech “network” / unavailable | Prefer Chrome; you can still capture after Talk starts the camera |
| Backend timeout on first request | Hit `/health` first (cold start) |

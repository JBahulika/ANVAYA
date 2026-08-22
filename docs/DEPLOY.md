# Deploy ANVAYA (production demo)

Camera and microphone **require HTTPS** (or localhost). Judges on phones cannot use a LAN `http://` URL.

## Architecture

```text
Phone / laptop (HTTPS)
    → Vercel (Next.js frontend)
        → Render (FastAPI + Gemini key)
            → Google Gemini 2.5 Flash
```

## 1. Backend — Render (Docker)

1. Push this repo to GitHub.
2. [Render](https://render.com) → New → Blueprint (or Web Service).
3. Root / Dockerfile path: **`backend`** (uses [`backend/Dockerfile`](../backend/Dockerfile)).
4. Health check path: `/health`
5. Environment variables:

| Key | Value |
|---|---|
| `GEMINI_API_KEY` | from [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `ENVIRONMENT` | `production` |
| `CORS_ORIGINS` | your Vercel URL, e.g. `https://anvaya.vercel.app` (no trailing slash; add preview URLs if needed) |
| `RATE_LIMIT_PER_MINUTE` | `30` |

6. Confirm: `https://YOUR-API.onrender.com/health` → `"gemini_configured": true`

**Free tier tip:** Render sleeps. Open `/health` ~2 minutes before the demo.

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
2. Environment variable (Production + Preview):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://YOUR-API.onrender.com` |

3. Deploy. Open the Vercel HTTPS URL on a phone. Allow camera + mic.
4. Update Render `CORS_ORIGINS` if the Vercel URL changed, then redeploy backend.

## 3. Demo day

1. Chrome (best for Talk / speech recognition).
2. Tap **Talk to ANVAYA** or use **Capture & hear** if mic fails.
3. Have a printed bill + a safe still hallway/stairs shot ready.
4. QR code on the PPT linking to the Vercel URL.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Camera blocked | Must be HTTPS or localhost |
| CORS error in browser console | Exact Vercel origin in `CORS_ORIGINS` |
| `gemini_configured: false` | Set `GEMINI_API_KEY` on Render |
| Speech “network” / unavailable | Use **Capture & hear**; prefer Chrome |
| Backend cold start timeout | Hit `/health` first |

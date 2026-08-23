# ANVAYA

Voice-first reader for people who are blind or have low vision. Point the camera at a bill or page, say what you need, and ANVAYA speaks the answer — amount due and deadline first.

The Gemini API key stays on the server. Photos are processed in memory and not stored.

## Local run

You need two terminals and a [Gemini API key](https://aistudio.google.com/apikey).

**Backend** (port 8000):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then set GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
```

**Frontend** (port 3000):

```bash
cd frontend
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Allow camera and microphone. Chrome is best for speech.

## Deploy

HTTPS is required for camera and mic on a phone.

1. **API** — Render Docker service from `backend/`. Set `GEMINI_API_KEY`, `ENVIRONMENT=production`, and `CORS_ORIGINS` to your exact frontend origin. See [`docs/DEPLOY.md`](docs/DEPLOY.md).
2. **UI** — Vercel project with root `frontend/` and `NEXT_PUBLIC_API_URL` pointing at the Render URL.

## Abuse protection

Public demos get scraped. ANVAYA limits Gemini spend per IP and across the whole process:

| Limit | Default |
|---|---|
| Per IP / minute | 10 |
| Per IP / hour | 40 |
| Per IP / day | 100 |
| All users / day (this instance) | 100 |
| Concurrent Gemini calls | 2 |

Uploads must be real JPEG/PNG/WebP/GIF bytes (not just a spoofed content-type), max 8 MB. Production hides Swagger docs and stack traces. Details: [`docs/SECURITY.md`](docs/SECURITY.md).

## How to use it

1. Tap **Talk**.
2. Hold the page to the camera.
3. After the beep, say what you need — “what is this?”, “how much is due?”, “how many items?”
4. Say **okay bye** or **stop** when you are done.

Images never leave RAM on the API. This is assistance, not medical, legal, or financial advice.

## API

`POST /analyze` · multipart · `image` (JPEG/PNG/WebP/GIF, max 8 MB) · `mode` · optional `question` (max 500 chars)

`GET /health` — reports whether `GEMINI_API_KEY` is set.

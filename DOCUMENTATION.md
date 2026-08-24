# ANVAYA — Documentation

Project documentation for **Prasunethon 2.0** judges and contributors.

## What ANVAYA is

ANVAYA is a voice-first accessibility app for people who are blind or have low vision. The user points a phone or laptop camera at a bill, letter, or label, asks a question out loud, and hears a clear spoken answer — **amount due and deadline first**, not a dump of every object in the photo.

**Live deployment:** [https://anvaya-ten.vercel.app](https://anvaya-ten.vercel.app)

## Submission links

| Requirement | Link |
|---|---|
| **Deployment** | [anvaya-ten.vercel.app](https://anvaya-ten.vercel.app) |
| **Source code** | [github.com/JBahulika/ANVAYA](https://github.com/JBahulika/ANVAYA) |
| **Pitch deck (PPT)** | [Google Slides](https://docs.google.com/presentation/d/1DGqHD5kImMCXFhliKshx4MAnHGbUTkPGToibX5Bqw6I/edit?slide=id.p2#slide=id.p2) |
| **Demo video** | [Google Drive](https://drive.google.com/file/d/1AjD0TvVreUNcRiL3qPvhTajvYQxl4rgo/view?usp=share_link) |
| **Documentation** | This file (`DOCUMENTATION.md`) |

## How a session works

1. User taps **Talk** (unlocks camera, mic, and speech).
2. User holds a document to the camera and speaks (e.g. “What is this?”).
3. The app captures a still image and sends it to the API.
4. A vision-language LLM reads the page and returns a short answer.
5. The browser speaks the answer aloud and shows it as text.
6. Follow-up questions reuse the same session flow.

## Architecture

```text
Browser (Next.js)
  → camera capture + Web Speech (listen / speak)
  → HTTPS POST /analyze (image + mode + optional question)
FastAPI (Render, Docker)
  → validate image · rate-limit · call LLM
Google Gemini 3.6 Flash
  → multimodal answer (text)
Browser
  → speechSynthesis reads the answer
```

## Tech stack

| Layer | Details |
|---|---|
| Frontend | Next.js **15.2.8**, React **19**, TypeScript, `getUserMedia`, Web Speech API |
| Backend | Python **3.12**, FastAPI **0.115**, Uvicorn, Pydantic **2** |
| LLM | **Google Gemini 3.6 Flash** (`gemini-3.6-flash`) via Google GenAI API (`google-genai` **1.14.0**) |
| Hosting | Frontend: **Vercel** · API: **Render** (`render.yaml`, `backend/Dockerfile`) |

## API (backend)

Base URL (production): `https://anvaya-api.onrender.com`

### `GET /health`

Returns service status and whether the LLM key is configured.

```json
{
  "status": "ok",
  "gemini_configured": true,
  "model": "gemini-3.6-flash"
}
```

### `POST /analyze`

Multipart form:

| Field | Description |
|---|---|
| `image` | JPEG / PNG / WebP / GIF (max 8 MB) |
| `mode` | e.g. `read`, `ask`, `simplify`, `auto` |
| `question` | Optional follow-up text |

Response includes spoken `text`, optional `aim_hint` (e.g. move closer / more light), and a short disclaimer. Images are processed in memory and not stored on disk.

## Voice examples

| User says | Effect |
|---|---|
| “What is this?” / “Read the bill” | Capture and read the page |
| “How much is due?” | Answer the question about the document |
| “Simplify” | Plain-language steps |

## Privacy notes

- Photos are handled in RAM for the request and not written to permanent storage by the app.
- The LLM API key lives only on the server (Render env), never in the browser.
- Production CORS allowlists the exact frontend origin.

## Run locally

**Backend**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > .env.local
npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Chrome.

## Team

Built by **J. Bahulika** · [GitHub](https://github.com/JBahulika) · [jbahulika@gmail.com](mailto:jbahulika@gmail.com)

ANVAYA assists with reading visible text. It is not medical, legal, or financial advice.

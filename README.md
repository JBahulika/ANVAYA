# ANVAYA

Multimodal accessibility copilot for Prasunethon 2.0 — **See → Understand → Explain → Alert**.

Point a camera at a document, sign, object, or environment. ANVAYA uses Gemini multimodal vision to return clear, prioritized text and spoken guidance.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js (App Router), browser camera + Web Speech API |
| Backend | FastAPI |
| AI | Google Gemini multimodal (`gemini-2.5-flash` by default) |

Images are processed in memory and not retained by the MVP backend. API keys never leave the server.

## Quick start

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Put your Gemini key in .env:
# GEMINI_API_KEY=your_key_here
uvicorn app.main:app --reload --port 8000
```

Health check: [http://localhost:8000/health](http://localhost:8000/health)

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local   # already points at http://localhost:8000
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Modes

- **Simple** — short, easy answer
- **Detailed** — more context
- **Alert** — hazards and urgent cues first
- **Read** — extract / summarize visible text
- **Ask** — answer a question about the image
- **Explain** — help the user understand what they see
- **Simplify** — plain-language rewrite

Voice: use **Mic** to dictate a question; responses auto-speak when analysis finishes (Chrome recommended).

## Demo checklist (hackathon)

1. **Bill / document** — Upload an electricity bill → mode **Read** → Analyze → hear amount + deadline.
2. **Explain simply** — Same image → mode **Simplify** (or **Explain** + “What do I have to do?”).
3. **Environment** — Capture stairs / hallway → mode **Alert**.
4. **Voice loop** — Mode **Ask** → Mic → “What does this say?” → Analyze → spoken answer.

## API

`POST /analyze` (multipart)

- `image` — file
- `mode` — `simple` \| `detailed` \| `alert` \| `read` \| `ask` \| `explain` \| `simplify`
- `question` — optional string

Response:

```json
{
  "text": "…",
  "mode": "read",
  "confidence_note": null,
  "disclaimer": "AI interpretations can contain errors…"
}
```

## Responsible AI

- Not medical advice; medicine labels are read, not interpreted as prescriptions.
- Hazard detection is imperfect — never treat as a guaranteed safety system.
- Sensitive documents: process only what you need; MVP does not store uploads.

## Project layout

```text
P31_ANVAYA/
  backend/app/     # FastAPI + Gemini pipeline
  frontend/        # Next.js ANVAYA UI
  README.md
  .env.example     # root pointer to backend key
```

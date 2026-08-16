# ANVAYA — Frontend

Next.js (App Router) interface for ANVAYA: camera capture, accessibility modes, and the browser voice loop.

```bash
cp .env.example .env.local   # points at http://localhost:8000
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The FastAPI backend must be running for analysis to work — see the [root README](../README.md) for full setup.

## Structure

- `app/page.tsx` — main experience (capture, modes, ask, result)
- `components/` — `CameraCapture`, `ModeSelector`, `ResultPanel`
- `lib/api.ts` — calls the backend `/analyze` endpoint
- `lib/speech.ts` — Web Speech helpers for speech-to-text and text-to-speech

No API keys belong here. All Gemini calls happen on the backend.

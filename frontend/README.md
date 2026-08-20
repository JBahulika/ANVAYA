# ANVAYA — Frontend

Next.js (App Router) interface for ANVAYA: **Talk to ANVAYA** voice agents, camera auto-capture, and a single spoken voice.

```bash
cp .env.example .env.local   # points at http://localhost:8000
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The FastAPI backend must be running for analysis to work — see the [root README](../README.md) for full setup. Allow camera + mic. **Chrome** is recommended for speech recognition.

## Voice commands

| Say | Agent |
|---|---|
| read this | Reader (`read`) |
| what's in front of me | Scene (`alert`) |
| ask, … | Ask |
| help / repeat / stop | Meta |

## Structure

- `app/page.tsx` — Talk session state machine + fallback Capture & hear
- `components/` — `CameraCapture`, `MoreOptions`, `ModeSelector`, `ResultPanel`
- `lib/api.ts` — calls the backend `/analyze` endpoint
- `lib/speech.ts` — TTS + continuous listen (pauses during speech)
- `lib/voiceCommands.ts` — offline keyword → agent mapping
- `lib/feedback.ts` — capture beep + haptic
- `public/manifest.json` — add-to-home-screen

No API keys belong here. All Gemini calls happen on the backend.

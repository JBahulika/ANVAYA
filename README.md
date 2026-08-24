<div align="center">

# ANVAYA

<img src="https://readme-typing-svg.demolab.com?font=Poppins&weight=600&size=22&duration=2800&pause=900&color=6B4F9A&center=true&vCenter=true&width=560&lines=See+%E2%86%92+Understand+%E2%86%92+Explain;Bills+spoken+out+loud;Amount+due+first.+Deadline+next." alt="See → Understand → Explain" />

**A voice-first reader for people who are blind or have low vision.**  
Point the camera at a bill or letter, ask what you need, and hear the answer.

<br />

[![Live Demo](https://img.shields.io/badge/%F0%9F%9A%80_Live_Demo-anvaya--ten.vercel.app-6B4F9A?style=for-the-badge)](https://anvaya-ten.vercel.app)
[![API](https://img.shields.io/badge/API-anvaya--api.onrender.com-009688?style=for-the-badge)](https://anvaya-api.onrender.com/health)

<br />

<img src="docs/assets/anvaya-hero.jpg" alt="ANVAYA — scan a bill, ask by voice, hear the answer" width="420" />

<br />

<img src="docs/assets/flow.svg" alt="Show → Ask → Hear" width="640" />

</div>

---

## Why it exists

Most AI vision apps describe *everything* in a photo. That is noise when you cannot see the page in your hand.

ANVAYA answers in the order that matters:

1. **What is this?**
2. **How much is due?**
3. **When is the deadline?**

Built for **Prasunethon 2.0** · Next.js + FastAPI + Gemini

---

## Try it (60 seconds)

1. Open **[anvaya-ten.vercel.app](https://anvaya-ten.vercel.app)** on Chrome (phone or laptop).
2. Tap **Talk** → allow camera + mic.
3. Hold a bill to the camera → say **“What is this?”**
4. Hear **amount due + due date** first.
5. Ask a follow-up (**“How much is due?”**) — same photo, no recapture.
6. Say **“Okay bye”** to end.

> Needs **HTTPS** for camera/mic. Use Chrome for the best Talk experience.

---

## How it works

```mermaid
flowchart LR
  A[Talk] --> B[Listen]
  B --> C[Capture]
  C --> D[Gemini]
  D --> E[Speak]
  E --> B
```

| Layer | Stack |
|---|---|
| UI | Next.js · camera · Web Speech (offline voice commands) |
| API | FastAPI · rate limits · ephemeral image handling |
| AI | Google Gemini 3.6 Flash |

Photos stay in memory only. The Gemini key never leaves the server.

---

## Say this

| You say | ANVAYA does |
|---|---|
| “What is this?” / “Read the bill” | Captures and reads the page |
| “How much is due?” | Answers from the last photo |
| “Simplify” | Plain steps: first / then / finally |
| “Okay bye” | Ends the session |

---

## Run locally

```bash
# Backend
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > .env.local
npm install && npm run dev
```

Deploy notes: [`docs/DEPLOY.md`](docs/DEPLOY.md) · Security: [`docs/SECURITY.md`](docs/SECURITY.md)

---

<div align="center">

**Built by [J. Bahulika](https://github.com/JBahulika)** · [Email](mailto:jbahulika@gmail.com) · [LinkedIn](https://www.linkedin.com/in/j-bahulika-8b8237207)

*Assists with reading visible text — not medical, legal, or financial advice.*

</div>

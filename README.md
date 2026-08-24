<div align="center">

# ANVAYA

<img src="https://readme-typing-svg.demolab.com?font=Poppins&weight=600&size=22&duration=2800&pause=900&color=6B4F9A&center=true&vCenter=true&width=560&lines=See+%E2%86%92+Understand+%E2%86%92+Explain;Bills+spoken+out+loud;Amount+due+first.+Deadline+next." alt="See → Understand → Explain" />

**A voice-first reader for people who are blind or have low vision.**  
Point the camera at a bill or letter, ask what you need, and hear the answer.

<br />

[![Live Demo](https://img.shields.io/badge/%F0%9F%9A%80_Live_Demo-anvaya--ten.vercel.app-6B4F9A?style=for-the-badge)](https://anvaya-ten.vercel.app)

<br />

<img src="docs/assets/anvaya-hero.jpg" alt="ANVAYA — scan a bill, ask by voice, hear the answer" width="420" />

</div>

---

## Why it exists

Most AI vision apps describe *everything* in a photo. That is noise when you cannot see the page in your hand.

ANVAYA answers in the order that matters:

1. **What is this?**
2. **How much is due?**
3. **When is the deadline?**

Built for **Prasunethon 2.0** · Next.js + FastAPI + LLM

---

## Try it

1. Open **[anvaya-ten.vercel.app](https://anvaya-ten.vercel.app)** on Chrome.
2. Tap **Talk** and allow camera + mic.
3. Hold a bill to the camera and ask what you need.
4. Listen to ANVAYA respond — then ask a follow-up if you want.

> Needs **HTTPS** for camera/mic. Use Chrome for the best Talk experience.

---

## How it works

**Talk → Capture → LLM → Speak**

| Layer | Stack |
|---|---|
| UI | Next.js · camera · voice |
| API | FastAPI |
| AI | Vision-language LLM |

Photos stay in memory only. API keys never leave the server.

---

## Say this

| You say | ANVAYA does |
|---|---|
| “What is this?” / “Read the bill” | Reads the page out loud |
| “How much is due?” | Answers your question |
| “Simplify” | Explains in plain steps |

---

## Run locally

```bash
# Backend
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your LLM API key
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

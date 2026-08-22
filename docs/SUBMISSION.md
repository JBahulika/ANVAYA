# Unstop / Prasunethon — Production submission checklist
# Fill URLs after you deploy. Keep secrets out of the repo.

## Required deliverables

| Deliverable | Status in this repo | What you submit |
|---|---|---|
| **Source code** | GitHub: `https://github.com/JBahulika/ANVAYA` | Public or shared repo link (use branch `feature/voice-first-agents` or merge to `main`) |
| **Documentation** | [README.md](../README.md), this file, [DEPLOY.md](DEPLOY.md), [SECURITY.md](SECURITY.md) | Link to README + docs folder |
| **Deployed / working demo** | See [DEPLOY.md](DEPLOY.md) | **Live HTTPS URL** (camera/mic need HTTPS) |
| **PPT** | [Anvaya_Prasunethon_BEEyond.pptx](Anvaya_Prasunethon_BEEyond.pptx) + [PITCH_SLIDE_OUTLINE.md](PITCH_SLIDE_OUTLINE.md) | Upload PPT / PDF |
| **Demo video** | Script: [DEMO_VIDEO_SCRIPT.md](DEMO_VIDEO_SCRIPT.md) | 60–120s video (Unstop upload / Drive / YouTube unlisted) |

## Your live links (fill before Unstop upload)

- **Frontend (demo):** `https://________________.vercel.app`
- **Backend health:** `https://________________.onrender.com/health`
- **Repo:** `https://github.com/JBahulika/ANVAYA`
- **Demo video:** `________________`
- **PPT:** `docs/Anvaya_Prasunethon_BEEyond.pptx`

## Evaluation criteria — where ANVAYA shows them

| Criterion | How ANVAYA demonstrates it |
|---|---|
| **Implementation** | Working Next.js + FastAPI + Gemini multimodal pipeline; voice session FSM; modes + aim hints |
| **Innovation** | Not generic captioning — **need-first** answers; named **Reader / Scene / Ask** voice agents; clock-face Alert language |
| **Usability** | One **Talk to ANVAYA** tap; auto-capture; Capture & hear fallback; large controls; spoken feedback |
| **Scalability** | Stateless API; ephemeral images (no disk); Docker + Render/Vercel split; horizontal-scale friendly design |
| **Performance** | Gemini Flash; 8 MB cap; short spoken answers; health checks; in-memory rate limit |
| **Security** | API key server-only; CORS allowlist; size/type validation; rate limit; production error sanitization; security headers; no image retention |
| **Real-world impact** | Assists blind/low-vision users with bills, labels, and still-scene orientation — with honest safety limits |

## Pre-submit day checklist

1. [ ] Deploy backend (Render) with `GEMINI_API_KEY`, `CORS_ORIGINS` = exact Vercel URL
2. [ ] Deploy frontend (Vercel) with `NEXT_PUBLIC_API_URL` = Render URL
3. [ ] Phone test on **HTTPS** + **Chrome**: Talk + Capture & hear
4. [ ] Warm Render free tier `/health` 2 minutes before judging
5. [ ] Record demo video from [DEMO_VIDEO_SCRIPT.md](DEMO_VIDEO_SCRIPT.md)
6. [ ] Align PPT bullets with [PITCH_SLIDE_OUTLINE.md](PITCH_SLIDE_OUTLINE.md)
7. [ ] Merge or point Unstop at the branch that includes voice-first + production docs
8. [ ] Never paste `GEMINI_API_KEY` into Unstop forms or the PPT

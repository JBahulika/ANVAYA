# Evaluation criteria mapping

Detailed mapping for judges / mentors. Short version lives in [SUBMISSION.md](SUBMISSION.md).

## Implementation
- Frontend: Talk session state machine, continuous listen with TTS pause, voice command parser, camera capture, PWA manifest.
- Backend: Mode-specific Gemini prompts, JSON aim hints, FastAPI multipart API, Docker image, health endpoint.
- Tests: `backend/tests/test_pipeline_helpers.py` (parse + rate limit).

## Innovation
- Prioritized “what you need now” vs dense scene dumps.
- Named voice agents (Reader / Scene / Ask) instead of a dense mode grid on the critical path.
- Orientation-style Alert language (clock-face + action).

## Usability
- One primary control: Talk to ANVAYA.
- Fallback: Capture & hear when Web Speech fails.
- Spoken status + large type results; trust line always visible.

## Scalability
- Stateless request/response; no shared disk.
- Frontend and API deploy independently (Vercel + Render).
- Rate limit is per-instance; replace with Redis for multi-node production.

## Performance
- `gemini-2.5-flash`, temperature 0.3, capped tokens.
- 8 MB upload cap; short spoken-friendly responses.
- Health check for cold-start probing.

## Security
See [SECURITY.md](SECURITY.md).

## Real-world impact
- Document access (bills, forms, labels) without a sighted helper.
- Still-scene caution cues with explicit non-guarantee.
- Honest limits build trust with accessibility communities and judges.

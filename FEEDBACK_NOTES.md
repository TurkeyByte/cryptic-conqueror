# Nebius / NVIDIA feedback notes (for the Devpost submission)

Keep adding to this while developing. The submission requires this feedback.

## Onboarding
- _TODO: account creation, getting the API key, free credits, time to first successful call._

## What worked well with Token Factory
- The OpenAI-compatible `chat/completions` API meant no SDK was needed. The integration is one `fetch` call (`lib/nemotron.js`).
- _TODO after live testing._

## Problems encountered
- Model IDs appear in different forms across pages. The endpoints page shows `NVIDIA/Nemotron-3-Super-120b-a12b`; the model catalog shows `nvidia/nemotron-3-super-120b-a12b`. We default to the catalog form and made the model configurable.
- Base URL also varies: a cookbook example uses a regional host (`api.tokenfactory.us-central1.nebius.com`), and other docs use `api.tokenfactory.nebius.com`. We made it configurable with `NEBIUS_BASE_URL`.
- We couldn't find documentation for turning Nemotron 3 "thinking" off on Token Factory. We send `chat_template_kwargs.enable_thinking=false`, retry without it if rejected, and strip any `<think>` output.
- _TODO: anything from live testing._

## Nemotron performance
- Latency: first live run on Vercel with `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`: about 1.1 s per plan (1.09 s last, 1.17 s average), measured from the browser, including the hop through our Vercel function. Fast enough that the Aswang adapts within a few seconds of a habit appearing.
- Model quality: first live match: 6 of 6 replies were valid JSON with allowed intents (no rejections). Its reads matched what the player did ("player uses lusob then whiffs", leading to BAIT and punishing whiffs; punishing dashes in round 2). The observe/adapt text was terse and used internal move names; worth prompting for friendlier wording.
- Playtest (14-year-old Roblox player): "it was cool because you can't spam", which is the adaptive AI doing its job. Requests: jump + attack at the same time, and crouch (both added).
- Nano vs. Super: _TODO: try `NEMOTRON_MODEL=nvidia/nemotron-3-super-120b-a12b` and compare latency and plan quality._

## What we would change
- _TODO_

## Would we use the tools again?
- _TODO_

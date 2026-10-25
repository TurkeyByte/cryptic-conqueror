# Third-party code, assets, and services

## Code libraries
None. The game and server use only the browser platform and the Node.js standard library.

## Art and audio
None. All visuals are drawn procedurally in `public/js/render.js`, and all sounds are synthesized in `public/js/audio.js`.

## Fonts
None bundled. The page uses the system UI font stack.

## Services (runtime, not redistributed)
- **Nebius Token Factory**: inference API (OpenAI-compatible).
- **NVIDIA Nemotron** (default `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`): open model served by Token Factory. Used under NVIDIA's model license via the hosted API; no weights are included in this repo.

Update this file whenever a library, asset, or service is added.

# LLM Architecture Atlas

Original, open-source **SVG redraws** of open-weight LLM architecture diagrams, in the visual
style of [Sebastian Raschka's LLM Architecture Gallery](https://sebastianraschka.com/llm-architecture-gallery/).

Model metadata (layers, heads, experts, attention variants, …) is taken from the gallery's
public data export ([Liears/llm-architecture-gallery](https://github.com/Liears/llm-architecture-gallery),
Apache-2.0) and cross-checked against each model's published config / tech report.

> **Not affiliated with or endorsed by Sebastian Raschka.** This repository contains only
> original vector redraws. The gallery's own images are copyrighted and are **not** included
> here; original figure watermarks/seals are intentionally omitted.

## Development

Monorepo: pnpm workspace (Node ≥ 22.12) + Python (pydantic v2).

```bash
pnpm install                 # .npmrc pins the npmmirror registry
pnpm build                   # astro static build
pnpm typecheck               # tsc + astro check, all packages
pnpm test                    # vitest (packages)
pnpm test:e2e                # builds web, runs Playwright smoke (chromium)
pnpm pytest                  # python tests (tools/ingest)

# python side (venv keeps the shared box clean)
python3 -m venv tools/ingest/.venv
tools/ingest/.venv/bin/pip install -e "tools/ingest[dev]"
```

CI (`.github/workflows/ci.yml`) runs the same gates on every push:
build → typecheck → vitest → Playwright smoke, plus pytest on Python 3.10/3.12.

Deployment: `.github/workflows/deploy.yml` publishes the site to GitHub Pages
on every push to `main`. One-time setup (repository admin):
**Settings → Pages → Build and deployment → Source: GitHub Actions**, then
re-run the deploy workflow.

## Figures

| Model | Figure | Source |
|---|---|---|
| GLM-5.3-Flash (320B-A18B) | [figures/glm-5.3-flash.svg](figures/glm-5.3-flash.svg) | [config](https://huggingface.co/zai-org/GLM-5.3-Flash/blob/main/config.json) |

Open `index.html` locally (or serve the folder with any static file server) for a
side-by-side viewer.

## Conventions

- One hand-authored SVG per model, plus a PNG preview (`figures/<model>.svg|png`).
- Layer counts, head counts, expert counts and dimensions in each figure come from
  `models.yml` / upstream configs, not by transcribing the original images.
- Accent colors follow the original gallery's per-family palette.

## Roadmap

- [ ] Cover the full 100+ model catalog (prioritize: DeepSeek, GLM, Qwen, GPT-OSS, Llama, Gemma)
- [ ] Template/generator: render figures programmatically from `models.yml`
- [ ] Per-family style tokens (color, attention-block variants: MLA, GQA, sliding window, linear attention)

## License

Code and figures in this repository: MIT (see `LICENSE`).
Model metadata: from the gallery data export, Apache-2.0.
Original gallery images: © Sebastian Raschka, not included.

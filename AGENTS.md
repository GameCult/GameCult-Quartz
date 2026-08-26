# AGENTS.md

## Purpose

`GameCult-Quartz` is the shared engine repo for GameCult's Quartz-based sites. It should contain shared build tooling, shared engine code, and reusable workflow plumbing. It should not quietly turn back into `gamecult-site` with the serial numbers filed off.

## Working Rules

- Keep site-specific copy, branding, mastheads, sidebars, and layout quirks in the consumer repo overlays.
- Shared engine changes should be generic by default and useful to more than one site.
- Norn owns reusable graph interaction and rendering. `quartz/graph-spa` owns only the generic Quartz content-index projection, article navigation, and shell; consumer taxonomy, filtering, and styling must arrive through overlay configuration.
- If a consumer repo needs custom page context, provide it through `site/quartz/components/sitePageContext.ts` in that repo instead of hardcoding the shared renderer.
- Do not point sample config at live production domains.
- Prefer reusable GitHub Actions workflows here over copy-pasted Pages workflows in every site repo.

## Consumer Expectations

Each consumer repo should provide:

- `site/quartz.config.ts`
- `site/quartz.layout.ts`
- any site-specific components under `site/quartz/components/`
- any site-specific styles under `site/quartz/styles/`
- optional static assets under `site/quartz/static/`

The shared build script stages the engine into `.quartz-build/engine` inside the consumer repo and overlays the site-specific files there.

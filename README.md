# Ascension (working title)

A browser real-time strategy game inspired by the late ages of Empire Earth: modern
armies, nuclear submarines and aircraft carriers, giant mechs, then orbital warfare.
Single player against an AI (Easy / Normal / Hard). Desktop and mobile.

TypeScript + three.js + Vite. Static site, installable PWA, plays offline. A single-file HTML build is also available.

## Status

Planning. See:
- [docs/PLAN.md](docs/PLAN.md): technical approach, architecture, AI, UI, milestones
- [docs/TECH_TREE.md](docs/TECH_TREE.md): ages, buildings, defenses, units, research, counters

## Run locally (once code exists)

```sh
npm install
npm run dev            # add `-- --host` to open it from your phone on the same Wi-Fi
npm run typecheck
npm test
npm run build          # static site in dist/
npm run build:single   # one self-contained HTML file in dist-single/
```

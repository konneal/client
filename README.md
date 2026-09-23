# @konneal/client

The publisher-site contract with the Konneal engine API. A Konneal
deployment's front end consumes this package instead of keeping local
copies of the client surface; the engine guarantees the wire, the
package guarantees the client.

## What ships

- **Wire types** (`src/types.ts`) — citations, messages, conversations,
  datasets, quota, memory files, projects. One source of truth for what
  the engine API says.
- **The SSE ask client** (`src/ask.ts`) — streamed answers with typed
  events, plus the dataset/feedback/research/memories/projects call
  surface.
- **The escape-first markdown renderer** (`src/markdown.ts`) — every
  character is escaped before formatting; model output can never inject
  HTML. Fenced code, headings, bold/italic, inline code, http(s)-only
  links, lists, blockquotes, tables, hr.
- **Citation presentation** (`src/citations.ts`) — chip labels, anchor
  deduplication, snippet cleanup, and `linkifyCitations(html, cites,
  publisher)` which anchors `[n]` and `[OIML …]`-style references to the
  source chips (pass your publisher's label prefix).
- **Rendered-document deep links** (`src/docs.ts`) — citation →
  `/docs/<slug>.html#anchor` resolution against the clause-anchor maps
  the mirror uploads.
- **Vue renderers** (`@konneal/client/vue`) — `SourceChips`,
  `FormulaBlock`, `UnitBlocks` (table/formula/figure/term/verdict/
  calculation/sequence blocks of the answer contract), `DocPane` (the
  in-context slide-over).
- **Renderer styles** (`@konneal/client/styles.css`) — the classes the
  renderers emit. Theme-neutral: colors and fonts come from the
  consumer's CSS tokens.

## Consuming (Astro + Vite + Tailwind v4)

    npm install @konneal/client

```js
// components — source-shipped SFCs; exclude from dep prebundling
// astro.config.mjs
vite: { optimizeDeps: { exclude: ["@konneal/client"] } }
```

```css
/* global stylesheet */
@import "@konneal/client/styles.css";
/* Tailwind v4: utilities inside the package need an explicit source */
@source "../node_modules/@konneal/client/src/**/*.vue";
```

The package is framework-agnostic at its core: everything except
`./vue` is dependency-free TypeScript with the DOM `fetch` as the only
runtime surface.

## The konneal CLI

```sh
npm i -g @konneal/client
export KONNEAL_BASE=https://your-deployment KONNEAL_KEY=your-api-key
konneal ask "What is a load cell?"            # SSE ask: reading line, tokens, citations, verdicts
konneal ask "…" --no-stream --licensed std:iec-60068-2-78
konneal search "damp heat" --k 5              # ranked passages, JSON
konneal keys list                             # admin: KONNEAL_ADMIN token
```

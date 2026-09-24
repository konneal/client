// The publisher-site contract, pinned: citation presentation, the
// escape-first markdown renderer, rendered-document deep links, and
// the SSE ask client. These behaviors are the reason the package
// exists — the site must not drift from the engine's wire.
import { test } from "node:test";
import assert from "node:assert/strict";
import { citationLabel, stripAnchorDup, cleanSnippet, linkifyCitations } from "../src/citations.ts";
import { renderMarkdown } from "../src/markdown.ts";
import { docSlug } from "../src/docs.ts";
import { askStreamed } from "../src/ask.ts";
import type { Citation } from "../src/types.ts";

const cite = (over: Partial<Citation> = {}): Citation => ({
  doc_id: "d1", docidentifier: "ACME AB 99-1:2019 (E)", ...over,
});

test("citationLabel strips language markers and dedupes the edition", () => {
  assert.equal(citationLabel(cite()), "ACME AB 99-1:2019");
  assert.equal(citationLabel(cite({ docidentifier: "B 18:2025 (E)", edition: "2025" })), "B 18:2025");
  assert.equal(citationLabel(cite({ docidentifier: "PD-06 Edition 4", edition: "4" })), "PD-06 Edition 4");
  assert.equal(citationLabel(cite({ docidentifier: "R 49", edition: "2010" })), "R 49:2010");
});

test("citationLabel hides producer-UUID anchors and formats clause anchors", () => {
  assert.equal(citationLabel(cite({ clause_anchor: "_c631773b-4bd0" })), "ACME AB 99-1:2019");
  assert.equal(citationLabel(cite({ clause_anchor: "2.11" })), "ACME AB 99-1:2019 §2.11");
  assert.equal(citationLabel(cite({ clause_anchor: "overview" })), "ACME AB 99-1:2019 ov");
});

test("stripAnchorDup presents each clause number exactly once", () => {
  assert.equal(stripAnchorDup("2.11 Load cell creep", "2.11"), "Load cell creep");
  assert.equal(stripAnchorDup("3 Definitions", "3"), "Definitions");
  assert.equal(stripAnchorDup("Untouched title", "overview"), "Untouched title");
});

test("cleanSnippet removes the anchor prefix the extraction repeats", () => {
  assert.equal(cleanSnippet("3.11 3.11 The creep is...", "3.11"), "The creep is...");
});

test("linkifyCitations anchors numeric refs to the source chips", () => {
  const c = [cite(), cite({ docidentifier: "R 49" })];
  const out = linkifyCitations("<p>See [1] and [2].</p>", c);
  assert.equal(out, '<p>See <a class="cite-ref" data-i="0" title="ACME AB 99-1:2019">[1]</a> and <a class="cite-ref" data-i="1" title="R 49">[2]</a>.</p>');
});

test("linkifyCitations matches publisher-name refs and passes unknown ones through", () => {
  const c = [cite()];
  const out = linkifyCitations("[ACME AB 99-1] says [9] and [ACME ZZZ]", c, "ACME");
  assert.ok(out.includes('<a class="cite-ref" data-i="0" title="ACME AB 99-1:2019">[1]</a>'));
  assert.match(out, /\[9\]/);
  assert.match(out, /\[ACME ZZZ\]/);
});

test("linkifyCitations takes the publisher prefix as a parameter", () => {
  const c = [cite({ docidentifier: "ISO 17025" })];
  const out = linkifyCitations("[ISO 17025] governs.", c, "ISO");
  assert.match(out, /data-i="0"/);
  // without a publisher prefix, non-numeric labels are not linkified
  const dflt = linkifyCitations("[ISO 17025] governs.", c);
  assert.equal(dflt, "[ISO 17025] governs.");
});

// ── markdown: escape-first, always ────────────────────────────────────

test("renderMarkdown escapes everything before formatting — no HTML injection", () => {
  const out = renderMarkdown('<img src=x onerror="alert(1)"> <script>alert(2)</script>');
  assert.ok(!out.includes("<img") && !out.includes("<script"));
  assert.ok(out.includes("&lt;img"));
});

test("renderMarkdown supports the subset the answers use", () => {
  const out = renderMarkdown("# Heading\n\n**bold** and *italic* and `code`\n\n- a\n- b\n\n| h1 | h2 |\n|---|---|\n| 1 | 2 |");
  assert.ok(out.includes("<h2>Heading</h2>"));
  assert.ok(out.includes("<strong>bold</strong>"));
  assert.ok(out.includes("<em>italic</em>"));
  assert.ok(out.includes("<code>code</code>"));
  assert.ok(out.includes("<ul>"));
  assert.ok(out.includes('<table class="md-table">'));
});

test("renderMarkdown allows only http(s) links", () => {
  const out = renderMarkdown("[x](javascript:alert(1)) [ok](https://example.com)");
  assert.ok(!out.includes("javascript:"));
  assert.ok(out.includes('href="https://example.com"'));
});

test("renderMarkdown keeps fenced code out of the inline rules", () => {
  const out = renderMarkdown("```\n**not bold** <raw>\n```");
  assert.ok(out.includes('<pre class="code-card">'));
  assert.ok(out.includes("**not bold** &lt;raw&gt;"));
});

// ── docs: the slug law (must match the mirror uploader) ───────────────

test("docSlug collapses every non-alphanumeric run to a single dash", () => {
  assert.equal(docSlug("ACME AB 99-1:2019 (E)"), "acme-ab-99-1-2019-e");
  assert.equal(docSlug("V 2--200 ?? edition"), "v-2-200-edition");
});

// ── ask: the SSE client against a stubbed transport ───────────────────

function sseResponse(frames: string[], headers: Record<string, string> = {}): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      for (const f of frames) c.enqueue(enc.encode(f));
      c.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", ...headers } });
}

test("askStreamed dispatches read before citations and tokens", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    sseResponse([
      'data: {"type":"read","read":{"intent":"definition","doc":"OIML R 76","edition":"2006","term":"maximum permissible error","terms":[],"lang":"en"}}\n\n',
      'data: {"type":"citations","citations":[{"doc_id":"d1","docidentifier":"R 76"}]}\n\n',
      'data: {"type":"token","v":"The "}\n\n',
      'data: {"type":"done","query_hash":"h1","follow_ups":[],"blocks":[],"read":{"intent":"definition","doc":"OIML R 76","edition":"2006","term":"maximum permissible error","terms":[],"lang":"en"}}\n\n',
    ])) as typeof fetch;
  try {
    const seen: string[] = [];
    const res = await askStreamed("q", {}, {
      onRead: (r) => { seen.push(`read:${r.doc}:${r.term}`); },
      onCitations: (c) => { seen.push(`citations:${c.length}`); },
      onToken: (t) => { seen.push(t); },
      onDone: (h, _f, _b, meta) => { seen.push(`done:${h}:${meta?.read?.doc ?? ""}`); },
    });
    assert.ok(res.ok);
    assert.deepEqual(seen, ["read:OIML R 76:maximum permissible error", "citations:1", "The ", "done:h1:OIML R 76"]);
  } finally {
    globalThis.fetch = orig;
  }
});

test("askStreamed dispatches citations, tokens and done", async () => {
  const orig = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init!.body)));
    return sseResponse([
      'data: {"type":"citations","citations":[{"doc_id":"d1","docidentifier":"R 1"}],"quota":{"used":1,"limit":10}}\n\n',
      'data: {"type":"token","v":"Hel"}\n\n',
      'data: {"type":"token","v":"lo"}\n\n',
      'data: {"type":"done","query_hash":"h1","follow_ups":["next?"],"blocks":[]}\n\n',
    ]);
  }) as typeof fetch;
  try {
    const seen: string[] = [];
    const res = await askStreamed("q", { effort: "medium", datasets: ["pub"] }, {
      onCitations: (c) => { seen.push(`citations:${c.length}`); },
      onQuota: (q) => { seen.push(`quota:${q.used}`); },
      onToken: (t) => { seen.push(t); },
      onDone: (h, f, b) => { seen.push(`done:${h}:${f?.length}:${b?.length}`); },
    });
    assert.ok(res.ok);
    assert.deepEqual(seen, ["citations:1", "quota:1", "Hel", "lo", "done:h1:1:0"]);
    assert.deepEqual((bodies[0] as { datasets: string[]; effort: string }).datasets, ["pub"]);
    assert.equal((bodies[0] as { effort: string }).effort, "medium");
  } finally {
    globalThis.fetch = orig;
  }
});

test("askStreamed maps quota_exceeded errors and surfaces the message", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { code: "quota_exceeded", message: "Daily limit reached." } }), {
      status: 429,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    let quota = 0;
    const res = await askStreamed("q", {}, { onQuota: () => { quota++; } });
    assert.ok(!res.ok && res.quotaExceeded);
    assert.equal(res.errorMessage, "Daily limit reached.");
    assert.equal(quota, 1);
  } finally {
    globalThis.fetch = orig;
  }
});

test("askStreamed skips malformed frames and honors error events", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    sseResponse(["data: {broken json}\n\n", 'data: {"type":"error","message":"busy"}\n\n'])) as typeof fetch;
  try {
    const errs: string[] = [];
    const res = await askStreamed("q", {}, { onError: (m) => { errs.push(m); } });
    assert.ok(res.ok);
    assert.deepEqual(errs, ["busy"]);
  } finally {
    globalThis.fetch = orig;
  }
});

test("askStreamed handles a non-streamed JSON answer", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ answer: "whole", citations: [{ doc_id: "d", docidentifier: "R 1" }], query_hash: "h" }), {
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    const toks: string[] = [];
    const dones: (string | null)[] = [];
    await askStreamed("q", {}, { onToken: (t) => { toks.push(t); }, onDone: (h) => { dones.push(h); } });
    assert.deepEqual(toks, ["whole"]);
    assert.deepEqual(dones, ["h"]);
  } finally {
    globalThis.fetch = orig;
  }
});

test("docSlug drops the edition year and (Annexes) — the mirror keys by base identifier", () => {
  assert.equal(docSlug("OIML R 60:2021"), "oiml-r-60");
  assert.equal(docSlug("OIML R 60 (Annexes)"), "oiml-r-60");
  assert.equal(docSlug("OIML R 60-1:2021"), "oiml-r-60-1");
  assert.equal(docSlug("OIML B 18:2025"), "oiml-b-18");
});

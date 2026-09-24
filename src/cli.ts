#!/usr/bin/env node
// konneal — the human/operator door to a Konneal deployment.
//   konneal ask "..."     the SSE ask, rendered citations and verdict blocks
//   konneal search "..."  ranked passages, JSON
//   konneal keys list     operator key inventory (admin token)
// Config: KONNEAL_BASE (default https://ai.oimlsmart.org), KONNEAL_KEY
// (the API key; admins: KONNEAL_ADMIN for the admin token).
import { argv, env } from "node:process";

const BASE = (env.KONNEAL_BASE || "http://localhost:8787").replace(/\/+$/, "");
const KEY = env.KONNEAL_KEY || "";
const ADMIN = env.KONNEAL_ADMIN || "";

const usage = `konneal — ask a Konneal deployment

  konneal ask "question" [--licensed std:iec-60068-2-78 ...] [--no-stream]
  konneal search "query" [--k 5]
  konneal keys list

Env: KONNEAL_BASE, KONNEAL_KEY (bearer), KONNEAL_ADMIN (admin routes).`;

function fail(m: string): never {
  console.error(m);
  process.exit(2);
}

async function ask(q: string, opts: { licensed: string[]; stream: boolean }) {
  if (!KEY) fail("KONNEAL_KEY is not set — the ask path requires an API key.");
  const res = await fetch(`${BASE}/v1/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ query: q, stream: opts.stream, ...(opts.licensed.length ? { licensed_standards: opts.licensed } : {}) }),
  });
  if (!res.ok) { console.error(await res.text()); process.exit(1); }
  if (!opts.stream) {
    const d = await res.json();
    process.stdout.write((d.answer ?? "") + "\n");
    for (const c of d.citations ?? []) console.log(`  [${c.docidentifier ?? ""}${c.clause_anchor ? " §" + c.clause_anchor : ""}]`);
    for (const b of d.blocks ?? []) if (b.type === "verdict") console.log(`  verdict: ${b.payload?.verdict} — ${b.payload?.note ?? ""}`);
    return;
  }
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      if (!p.startsWith("data:")) continue;
      let e: any;
      try { e = JSON.parse(p.slice(5).trim()); } catch { continue; }
      if (e.type === "read") console.error(`# read as — ${e.read?.doc ?? e.read?.intent ?? "?"}`);
      else if (e.type === "token") process.stdout.write(e.v ?? "");
      else if (e.type === "done") {
        process.stdout.write("\n");
        for (const c of e.citations ?? []) console.log(`  [${c.docidentifier ?? ""}${c.clause_anchor ? " §" + c.clause_anchor : ""}]`);
        for (const b of e.blocks ?? []) if (b.type === "verdict") console.log(`  verdict: ${b.payload?.verdict} — ${b.payload?.note ?? ""}`);
      }
    }
  }
}

async function search(q: string, k: number) {
  if (!KEY) fail("KONNEAL_KEY is not set — the search path requires an API key.");
  const res = await fetch(`${BASE}/v1/search`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ query: q, k }),
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}

async function keys() {
  if (!ADMIN) fail("KONNEAL_ADMIN is not set — key management requires the admin token.");
  const res = await fetch(`${BASE}/v1/admin/keys`, { headers: { authorization: `Bearer ${ADMIN}` } });
  console.log(JSON.stringify(await res.json(), null, 2));
}

const [cmd, ...rest] = argv.slice(2);
const q = rest.filter((a) => !a.startsWith("--")).join(" ");
if (cmd === "ask") await ask(q, { licensed: rest.filter((a, i) => rest[i - 1] === "--licensed"), stream: !rest.includes("--no-stream") });
else if (cmd === "search") await search(q, Number(rest[rest.indexOf("--k") + 1] || 5));
else if (cmd === "keys" && rest[0] === "list") await keys();
else console.log(usage);

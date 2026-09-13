// Citation presentation helpers (pure functions — shared by the Vue
// components; no DOM).

import type { Citation } from "./types";

export function citationLabel(c: Citation): string {
  // display-only cleanup; the raw fields stay authoritative in the API:
  // (1) OIML language markers ("OIML B 18:2025 (E)") are catalog noise;
  // (2) the edition is appended only when the identifier does not already
  //     carry it ("B 18:2025 (E)" + "2025" must not read ":2025:2025";
  //     "PD-06 Edition 4" + "4" must not read "Edition 4:4");
  // (3) anchors that are producer UUIDs ("§_c631773b-…") say nothing to a
  //     reader — the clause title already shows in the source card.
  const id = (c.docidentifier || c.doc_id || "source").replace(/\s*\(([A-Z])\)\s*$/, "").trim();
  const edition = c.edition && !id.includes(c.edition) ? ":" + c.edition : "";
  const rawAnchor = String(c.clause_anchor ?? "");
  const garbageAnchor = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(rawAnchor) || (rawAnchor.startsWith("_") && rawAnchor.length > 12);
  const anchor = garbageAnchor ? "" : rawAnchor === "overview" ? " ov" : rawAnchor ? " §" + rawAnchor : "";
  return `${id}${edition}${anchor}`;
}

// extraction keeps the clause number in both anchor and title ("§1.1" +
// "1.1 Load cell") — present each number exactly once
export function stripAnchorDup(title: string, anchor?: string | number): string {
  let t = (title || "").trim();
  if (anchor && String(anchor) !== "overview") {
    const a = String(anchor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`^§?\\s*${a}\\b[.\\s]*`, "i"), "");
  }
  return t.replace(/^[\d.]+\s+/, (m) => (/^\d+(\.\d+)*\s+$/.test(m) ? "" : m)).trim() || title;
}

export function cleanSnippet(snippet: string, anchor?: string | number): string {
  let s = (snippet || "").trim();
  if (anchor && String(anchor) !== "overview") {
    const a = String(anchor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`^§?\\s*${a}\\s*${a}?\\s*`, "i"), "");
  }
  return s;
}

/** Wrap [n] and [OIML …] citation labels in the ESCAPED rendered answer
 *  with anchors that point at the source chips. Operates on the
 *  escape-first markdown output string — it only ever touches text. */
export function linkifyCitations(html: string, cites: Citation[], publisher = "OIML"): string {
  if (!cites?.length) return html;
  const chipTargets = cites.map((c) => citationLabel(c));
  return html.replace(new RegExp(`\\[((?:\\d{1,2})|${publisher}[^\\]]{2,70})\\]`, "g"), (m, inner: string) => {
    let i = /^\d+$/.test(inner) ? Number(inner) - 1 : chipTargets.findIndex((lbl) => lbl.startsWith(inner.split("§")[0].trim()));
    if (i < 0 || i >= cites.length) return m;
    return `<a class="cite-ref" data-i="${i}" title="${chipTargets[i]}">[${i + 1}]</a>`;
  });
}

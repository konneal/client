// metanorma-mirror layers 2–3 (TODO.impl/73): a citation becomes a door
// into the original document. Rendered publications live at
// /docs/<slug>.html with a clause-anchor map at /docs/<slug>.anchors.json
// (uploaded by scripts/upload_documents.py from the clean corpus's own
// Metanorma renderings). The slug function MUST match the uploader's:
// every non-alphanumeric run collapses to a single dash.
import type { Citation } from "./types";

const slugCache = new Map<string, string>();
const anchorCache = new Map<string, Promise<Record<string, string> | null>>();

// A deployment maps internal-corpus citations to their own document
// origin (the internal renderings live behind the member-only door, not
// the site's origin). Publisher-neutral: nothing here knows the base —
// the site configures it once at startup.
let baseFor: ((c: { corpus?: string }) => string | undefined) | null = null;

export function configureDocs(opts: { baseFor?: (c: { corpus?: string }) => string | undefined }): void {
  baseFor = opts.baseFor ?? null;
}

function docBase(c: { corpus?: string }): string {
  const base = baseFor?.(c);
  return base ? base.replace(/\/+$/, "") : "";
}

export function docSlug(docidentifier: string): string {
  const hit = slugCache.get(docidentifier);
  if (hit) return hit;
  // The mirror uploads renderings keyed by the publication's base
  // identifier — the edition year and the "(Annexes)" suffix never
  // name a separate rendering (they cite the same document), so they
  // are dropped from the slug before lookup.
  const base = docidentifier.replace(/\s*\(Annexes\)\s*$/i, "").replace(/:\d{4}$/, "");
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  slugCache.set(docidentifier, slug);
  return slug;
}

/** The clause-anchor map for a document; null when the document is not
 *  rendered (dirty corpus, unmapped) — callers degrade to the chip. */
export function docAnchors(docidentifier: string, c?: { corpus?: string }): Promise<Record<string, string> | null> {
  const slug = docSlug(docidentifier);
  const key = `${docBase(c ?? {})}|${slug}`;
  if (!anchorCache.has(key)) {
    anchorCache.set(
      key,
      fetch(`${docBase(c ?? {})}/docs/${slug}.anchors.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return anchorCache.get(slug)!;
}

export interface DocTarget {
  url: string;
  anchor: string | null;
}

/** Resolve a citation to an in-document target, or null when the clause
 *  is not deep-linkable (no rendering, or the anchor map lacks the
 *  clause — UUID-anchored clauses carry no clause number). */
export async function docTarget(c: Citation): Promise<DocTarget | null> {
  if (!c.docidentifier) return null;
  const slug = docSlug(c.docidentifier);
  const anchors = await docAnchors(c.docidentifier, c);
  if (!anchors) return null;
  const clause = (c.clause_anchor || "").trim();
  const anchor = clause && anchors[clause] ? anchors[clause] : firstPrefix(anchors, clause);
  return { url: `${docBase(c)}/docs/${slug}.html${anchor ? `#${anchor}` : ""}`, anchor };
}

function firstPrefix(anchors: Record<string, string>, clause: string): string | null {
  if (!clause) return null;
  // a UUID anchor ("_56869fe3-…") never maps — only numbered clauses do
  if (!/^\d/.test(clause)) return null;
  const keys = Object.keys(anchors)
    .filter((k) => k === clause || k.startsWith(clause + "."))
    .sort((a, b) => a.length - b.length);
  return keys.length ? anchors[keys[0]] : null;
}

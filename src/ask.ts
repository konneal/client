// /api/ask SSE client + datasets fetch + feedback. Typed events; the
// component owns throttling/state.

import type { Citation, Dataset, MemoryFile, Project, ProjectFile, Quota } from "./types";

export interface AskOptions {
  prev?: string;
  conversation_id?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  /** thorough answers: member lane, salts the cache server-side */
  effort?: "low" | "medium";
  lang?: string;
  fresh?: boolean;
  /** data URL of a user-attached image (multimodal question context) */
  image?: string;
  /** dataset ids the user kept in scope (the sidebar toggles); the
   *  server intersects with session permissions */
  datasets?: string[];
  /** memory file ids selected for this ask (member-scoped server-side) */
  memories?: string[];
  signal?: AbortSignal;
}

export type AskRead = {
  intent: string;
  doc: string | null;
  edition: string | null;
  term: string | null;
  terms: string[];
  lang: string | null;
};

export interface AskEvents {
  onCitations?: (citations: Citation[], quality?: { sourceQuality: "verified" | "curated" | "ocr" | null; confidenceNote: string | null }) => void;
  onQuota?: (quota: Quota) => void;
  onToken?: (tok: string) => void;
  /** fires when the stream opens with the reading — before citations and tokens */
  onRead?: (read: AskRead) => void;
  onDone?: (
    queryHash: string | null,
    followUps?: string[],
    blocks?: unknown[],
    meta?: {
      servedFrom?: "cache" | "similar";
      passages?: { d: string; a: string; t: string; s?: { cols: string[]; rowsShown: number; rowsTotal: number } }[];
      read?: AskRead;
    },
  ) => void;
  onError?: (message: string) => void;
}

export interface AskResult {
  ok: boolean;
  /** server-delivered error message when !ok (already user-facing) */
  errorMessage?: string;
  quotaExceeded?: boolean;
}

export async function askStreamed(query: string, opts: AskOptions, ev: AskEvents): Promise<AskResult> {
  let res: Response;
  try {
    res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        conversation_id: opts.conversation_id,
        prev: opts.prev,
        history: opts.history,
        lang: opts.lang,
        stream: true,
        fresh: opts.fresh,
        image: opts.image,
        ...(opts.datasets ? { datasets: opts.datasets } : {}),
        ...(opts.effort && opts.effort !== "low" ? { effort: opts.effort } : {}),
        ...(opts.memories?.length ? { memories: opts.memories } : {}),
      }),
      signal: opts.signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    return { ok: false, errorMessage: "Network error — please retry." };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message || `Request failed (${res.status}).`;
    if (body?.error?.code === "quota_exceeded") ev.onQuota?.({ used: 0, limit: 0 });
    return { ok: false, errorMessage: msg, quotaExceeded: body?.error?.code === "quota_exceeded" };
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const data = await res.json().catch(() => null);
    if (data?.read) ev.onRead?.(data.read);
    if (data?.citations) ev.onCitations?.(data.citations, { sourceQuality: data.source_quality ?? null, confidenceNote: data.confidence_note ?? null });
    if (data?.quota) ev.onQuota?.(data.quota);
    if (data?.answer) ev.onToken?.(data.answer);
    ev.onDone?.(
      data?.query_hash ?? null,
      Array.isArray(data?.follow_ups) ? data.follow_ups : [],
      Array.isArray(data?.blocks) ? data.blocks : [],
      { servedFrom: data?.cached ? "cache" : data?.similar ? "similar" : undefined, read: data?.read ?? undefined, passages: Array.isArray(data?.context) ? data.context.map((c: { doc_id?: string; clause_anchor?: string; text?: string; sel?: { cols: string[]; rowsShown: number; rowsTotal: number } }) => ({ d: c.doc_id ?? "", a: c.clause_anchor ?? "", t: c.text ?? "", ...(c.sel ? { s: c.sel } : {}) })) : undefined },
    );
    return { ok: true };
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      let evt: any;
      try {
        evt = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === "read") ev.onRead?.(evt.read);
      else if (evt.type === "citations") {
        ev.onCitations?.(evt.citations ?? [], { sourceQuality: evt.source_quality ?? null, confidenceNote: evt.confidence_note ?? null });
        if (evt.quota) ev.onQuota?.(evt.quota);
      } else if (evt.type === "token") {
        ev.onToken?.(evt.v ?? "");
      } else if (evt.type === "done") {
        ev.onDone?.(
          evt.query_hash ?? null,
          Array.isArray(evt.follow_ups) ? evt.follow_ups : [],
          Array.isArray(evt.blocks) ? evt.blocks : [],
          { servedFrom: evt.served_from, read: evt.read ?? undefined, passages: Array.isArray(evt.passages) ? evt.passages : undefined },
        );
      } else if (evt.type === "error") {
        ev.onError?.(evt.message || "Stream error.");
      }
    }
  }
  return { ok: true };
}

export interface ClientConfig {
  datasets: Dataset[];
  suggestions: string[];
}

export async function fetchClientConfig(): Promise<ClientConfig> {
  try {
    const d = await fetch("/api/datasets").then((r) => r.json());
    return {
      datasets: Array.isArray(d?.datasets) ? d.datasets : [],
      suggestions: Array.isArray(d?.suggestions) ? d.suggestions.filter((s: unknown) => typeof s === "string") : [],
    };
  } catch {
    return { datasets: [], suggestions: [] };
  }
}

export async function sendFeedback(queryHash: string, rating: 1 | -1): Promise<void> {
  try {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query_hash: queryHash, rating }),
    });
  } catch {
    /* non-critical */
  }
}

/** Deep-research (members): bounded agentic loop server-side; returns a
 *  complete answer with citations + research metadata. Not streamed. */
export interface ResearchPass {
  n: number;
  of: number;
  phase: "retrieving" | "judged" | "writing";
  passages?: number;
  sufficient?: boolean | null;
  missing?: string;
}
export async function askResearch(
  query: string,
  prev?: string,
  onPass?: (p: ResearchPass) => void,
): Promise<{ ok: boolean; answer?: string; citations?: unknown[]; blocks?: unknown[]; research?: { iterations: number; passages: number; elapsed_ms: number; sufficient?: boolean | null }; errorMessage?: string }> {
  try {
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, prev, ...(onPass ? { stream: true } : {}) }),
    });
    if (onPass && (res.headers.get("content-type") ?? "").includes("text/event-stream")) {
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let done: any = null;
      for (;;) {
        const { done: rd, value } = await reader.read();
        if (rd) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          let evt: any;
          try { evt = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (evt.type === "pass") onPass(evt as ResearchPass);
          else if (evt.type === "done") done = evt;
          else if (evt.type === "error") return { ok: false, errorMessage: evt.message || "The research failed." };
        }
      }
      if (done) return { ok: true, answer: done.answer, citations: done.citations, blocks: done.blocks, research: done.research };
      return { ok: false, errorMessage: "The stream ended before the answer." };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, errorMessage: data?.error?.message || `Request failed (${res.status}).` };
    return { ok: true, answer: data.answer, citations: data.citations, blocks: data.blocks, research: data.research };
  } catch {
    return { ok: false, errorMessage: "Network error — please retry." };
  }
}


export async function fetchMemories(): Promise<MemoryFile[]> {
  try {
    const r = await fetch("/api/memories");
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d?.memories) ? d.memories : [];
  } catch {
    return [];
  }
}

export async function saveMemory(m: { id?: string; name: string; content: string }): Promise<MemoryFile["id"] | null> {
  const r = await fetch("/api/memories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(m),
  });
  if (!r.ok) return null;
  return (await r.json()).id ?? null;
}

export async function deleteMemory(id: string): Promise<boolean> {
  return (await fetch(`/api/memories/${encodeURIComponent(id)}`, { method: "DELETE" })).ok;
}


export async function fetchProjects(): Promise<Project[]> {
  try {
    const r = await fetch("/api/projects");
    if (!r.ok) return [];
    return (await r.json()).projects ?? [];
  } catch {
    return [];
  }
}

export async function createProject(name: string): Promise<string | null> {
  const r = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
  return r.ok ? (await r.json()).id : null;
}

export async function deleteProject(id: string): Promise<boolean> {
  return (await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" })).ok;
}

export async function moveConversation(conversationId: string, projectId: string | null): Promise<boolean> {
  const r = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversation_id: conversationId, project_id: projectId }),
  });
  return r.ok;
}

export async function fetchProjectFiles(projectId: string): Promise<ProjectFile[]> {
  try {
    const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`);
    if (!r.ok) return [];
    return (await r.json()).files ?? [];
  } catch {
    return [];
  }
}

export async function saveProjectFile(projectId: string, file: { id?: string; name: string; content: string }): Promise<string | null> {
  const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_id: projectId, ...file }),
  });
  return r.ok ? (await r.json()).id : null;
}

export async function deleteProjectFile(id: string): Promise<boolean> {
  return (await fetch(`/api/project-files/${encodeURIComponent(id)}`, { method: "DELETE" })).ok;
}

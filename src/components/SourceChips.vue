<script setup lang="ts">
// Sources as stacked chips (the SOTA citation surface): citations of the
// SAME document collapse into one chip carrying their numbers ("1·2",
// ×N) so a five-clause answer never rows five identical labels; the row
// caps and overflows into a +K expander. Clicking a chip opens the
// GROUP's card — one card per member citation, numbered as the answer
// cites them. Inline [n] references still drive openIdx directly.
import { computed, ref } from "vue";
import type { Citation } from "../types";
import { citationLabel, cleanSnippet, stripAnchorDup } from "../citations";
import { docTarget } from "../docs";

const props = withDefaults(
  defineProps<{
    cites: Citation[];
    openIdx: number | null;
    labels?: { sources: string; open: string };
    /** groups visible before the +K expander (default 8) */
    max?: number;
  }>(),
  { labels: () => ({ sources: "Sources", open: "Open ↗" }), max: 8 },
);
const emit = defineEmits<{ toggle: [i: number] }>();

interface Group {
  members: { i: number; c: Citation }[];
}

// a group is a maximal RUN of same-document citations (doc_id + edition)
// — adjacency keeps the chips' reading order aligned with the answer's
const groups = computed<Group[]>(() => {
  const out: Group[] = [];
  for (let i = 0; i < props.cites.length; i++) {
    const c = props.cites[i];
    const last = out[out.length - 1];
    const head = last?.members[0].c;
    if (head && head.doc_id === c.doc_id && (head.edition ?? "") === (c.edition ?? "")) last.members.push({ i, c });
    else out.push({ members: [{ i, c }] });
  }
  return out;
});

const expanded = ref(false);
const visible = computed(() => (expanded.value ? groups.value : groups.value.slice(0, props.max)));
const hidden = computed(() => groups.value.length - visible.value.length);

const nums = (g: Group) => g.members.map((m) => m.i + 1).join("·");
const groupOf = (i: number | null) => (i == null ? null : groups.value.find((g) => g.members.some((m) => m.i === i)) ?? null);
const isOpen = (g: Group) => g.members.some((m) => m.i === props.openIdx);
const title = (g: Group) =>
  g.members.length === 1
    ? (g.members[0].c.clause_title || "") + " — click to expand"
    : g.members.map((m) => `[${m.i + 1}] ${stripAnchorDup(m.c.clause_title || "", m.c.clause_anchor) || m.c.clause_anchor}`).join("\n");

const QUALITY_BADGE: Record<string, { label: string; cls: string }> = {
  verified: { label: "verified model", cls: "quality-verified" },
  curated: { label: "edited corpus", cls: "quality-curated" },
  ocr: { label: "OCR (experimental)", cls: "quality-ocr" },
};
const badge = (q?: string) => (q ? QUALITY_BADGE[q] : undefined);

// metanorma-mirror: deep links resolve lazily — most citations never
// open the original, and the anchor map is one cached fetch per document
const targets = ref<Record<number, { url: string; anchor: string | null } | null>>({});
const resolve = (i: number, c: Citation) => {
  if (!(i in targets.value)) void docTarget(c).then((t) => (targets.value[i] = t));
  return targets.value[i];
};
defineExpose({ resolve });

// the pane lives at the app root — a window event hops the component
// tree without threading props through AssistantMessage
const openPane = (c: Citation, t: { url: string; anchor: string | null }) => {
  window.dispatchEvent(new CustomEvent("rag:open-doc", { detail: { url: t.url, label: citationLabel(c), clause: c.clause_anchor } }));
};
</script>

<template>
  <div v-if="cites.length" class="mt-4 pt-3 border-t border-dashed border-rule">
    <div class="font-mono text-[0.68rem] uppercase tracking-wider text-ink-muted mb-1.5">{{ labels.sources }}</div>
    <div class="src-chips">
      <button
        v-for="g in visible"
        :key="g.members[0].i"
        type="button"
        class="src-chip"
        :class="{ open: isOpen(g) }"
        :title="title(g)"
        @click="emit('toggle', g.members[0].i)"
      >
        <span class="n">{{ nums(g) }}</span>
        <span class="truncate">{{ citationLabel(g.members[0].c) }}</span>
        <span v-if="g.members.length > 1" class="text-[0.65rem] text-ink-muted">×{{ g.members.length }}</span>
        <a
          v-if="g.members[0].c.url"
          :href="g.members[0].c.url"
          target="_blank"
          rel="noopener"
          class="text-[0.65rem] text-ink-muted hover:text-accent ml-1"
          title="View the original publication"
          @click.stop
        >↗</a>
      </button>
      <button v-if="hidden > 0" type="button" class="src-chip" title="Show the remaining sources" @click="expanded = true">
        <span class="n">+{{ hidden }}</span>
      </button>
    </div>
    <div class="src-cards">
      <div
        v-for="m in groupOf(openIdx)?.members ?? []"
        v-show="groupOf(openIdx)"
        :key="'card' + m.i"
        class="src-card open-card"
      >
        <div class="border-l-2 border-accent bg-accent-soft/60 dark:bg-accent-soft/40 rounded-r-lg px-3 py-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-mono text-xs text-accent font-medium">[{{ m.i + 1 }}] {{ citationLabel(m.c) }}</span>
            <span v-if="badge(m.c.quality)" class="src-badge" :class="badge(m.c.quality)!.cls">{{ badge(m.c.quality)!.label }}</span>
            <span v-if="m.c.status === 'withdrawn' || m.c.status === 'superseded'" class="src-badge" :class="m.c.status">
              {{ m.c.status === "withdrawn" ? "withdrawn" : "superseded" + (m.c.superseded_by ? " → " + m.c.superseded_by : "") }}
            </span>
            <span v-else-if="m.c.status === 'in-force' || m.c.status === 'joint'" class="src-badge in-force">in force</span>
          </div>
          <div v-if="stripAnchorDup(m.c.clause_title || '', m.c.clause_anchor)" class="text-xs text-ink-soft mt-0.5">
            {{ stripAnchorDup(m.c.clause_title || "", m.c.clause_anchor) }}
          </div>
          <div v-if="cleanSnippet(m.c.snippet || '', m.c.clause_anchor)" class="text-xs text-ink-muted mt-1 leading-relaxed">
            {{ cleanSnippet(m.c.snippet || "", m.c.clause_anchor).slice(0, 220) }}{{ (cleanSnippet(m.c.snippet || "", m.c.clause_anchor).length > 220 ? "…" : "") }}
          </div>
          <div v-if="resolve(m.i, m.c)" class="mt-1.5 flex items-center gap-3 text-xs">
            <button type="button" class="text-accent underline" title="Read the original document at this clause, in context" @click="openPane(m.c, resolve(m.i, m.c)!)">In context</button>
            <a :href="resolve(m.i, m.c)!.url" target="_blank" class="text-accent underline" title="Open the original document at this clause in a new tab">{{ labels.open }}</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { withDefaults } from "vue";
// Sources as numbered chips; each expands a detail card under the row.
// Inline [n] references in the answer link to these chips (openIdx is
// lifted so the body's cite-refs can drive it).
import { ref } from "vue";
import type { Citation } from "../types";
import { citationLabel, cleanSnippet, stripAnchorDup } from "../citations";
import { docTarget } from "../docs";

const props = withDefaults(
  defineProps<{
    cites: Citation[];
    openIdx: number | null;
    labels?: { sources: string; open: string };
  }>(),
  { labels: () => ({ sources: "Sources", open: "Open ↗" }) },
);
const emit = defineEmits<{ toggle: [i: number] }>();

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
        v-for="(c, i) in cites"
        :key="i"
        type="button"
        class="src-chip"
        :class="{ open: openIdx === i }"
        :title="(c.clause_title || '') + ' — click to expand'"
        @click="emit('toggle', i)"
      >
        <span class="n">{{ i + 1 }}</span>
        <span class="truncate">{{ citationLabel(c) }}</span>
        <a
          v-if="c.url"
          :href="c.url"
          target="_blank"
          rel="noopener"
          class="text-[0.65rem] text-ink-muted hover:text-accent ml-1"
          title="View the original publication"
          @click.stop
        >↗</a>
      </button>
    </div>
    <div class="src-cards">
      <div
        v-for="(c, i) in cites"
        v-show="openIdx === i"
        :key="'card' + i"
        class="src-card"
        :class="{ 'open-card': openIdx === i }"
      >
        <div class="border-l-2 border-accent bg-accent-soft/60 dark:bg-accent-soft/40 rounded-r-lg px-3 py-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-mono text-xs text-accent font-medium">{{ citationLabel(c) }}</span>
            <span v-if="c.status === 'withdrawn' || c.status === 'superseded'" class="src-badge" :class="c.status">
              {{ c.status === "withdrawn" ? "withdrawn" : "superseded" + (c.superseded_by ? " → " + c.superseded_by : "") }}
            </span>
            <span v-else-if="c.status === 'in-force' || c.status === 'joint'" class="src-badge in-force">in force</span>
          </div>
          <div v-if="stripAnchorDup(c.clause_title || '', c.clause_anchor)" class="text-xs text-ink-soft mt-0.5">
            {{ stripAnchorDup(c.clause_title || "", c.clause_anchor) }}
          </div>
          <div v-if="cleanSnippet(c.snippet || '', c.clause_anchor)" class="text-xs text-ink-muted mt-1 leading-relaxed">
            {{ cleanSnippet(c.snippet || "", c.clause_anchor).slice(0, 220) }}{{ (cleanSnippet(c.snippet || "", c.clause_anchor).length > 220 ? "…" : "") }}
          </div>
          <div v-if="resolve(i, c)" class="mt-1.5 flex items-center gap-3 text-xs">
            <button type="button" class="text-accent underline" title="Read the original document at this clause, in context" @click="openPane(c, resolve(i, c)!)">In context</button>
            <a :href="resolve(i, c)!.url" target="_blank" class="text-accent underline" title="Open the original document at this clause in a new tab">{{ labels.open }}</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

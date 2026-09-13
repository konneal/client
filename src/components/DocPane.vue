<script setup lang="ts">
// metanorma-mirror layer 3 (TODO.impl/73): the in-context pane — the
// original document opens AT the cited clause, in a slide-over. The
// rendered page is same-origin static HTML from /docs/, so the iframe
// scrolls to the anchor natively; a highlight makes the clause pop.
import { onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{ open: boolean; url: string; label: string; clause?: string }>();
const emit = defineEmits<{ close: [] }>();

const frame = ref<HTMLIFrameElement | null>(null);

const highlight = () => {
  const doc = frame.value?.contentDocument;
  if (!doc) return;
  doc.querySelectorAll(".rag-pane-highlight").forEach((el) => el.classList.remove("rag-pane-highlight"));
  const target = doc.getElementById((props.url.split("#")[1] || "").trim());
  if (target) {
    target.classList.add("rag-pane-highlight");
    target.scrollIntoView({ block: "center" });
  }
};

const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape") emit("close");
};
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
watch(() => props.url, () => frame.value?.addEventListener("load", highlight, { once: true }));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="doc-pane-host">
      <div class="doc-pane-backdrop" @click="emit('close')" />
      <aside class="doc-pane" role="dialog" :aria-label="`Original document — ${label}`">
        <header class="doc-pane-bar">
          <span class="truncate font-mono text-xs text-ink-soft">{{ label }}{{ clause ? ` §${clause}` : "" }}</span>
          <span class="text-[0.65rem] text-ink-muted hidden sm:inline">the original document, at the cited clause</span>
          <button type="button" class="ml-auto px-2 text-ink-muted hover:text-ink" aria-label="Close" @click="emit('close')">✕</button>
        </header>
        <iframe ref="frame" :src="url" class="doc-pane-frame" title="Original document" @load="highlight" />
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.doc-pane-host { position: fixed; inset: 0; z-index: 60; }
.doc-pane-backdrop { position: absolute; inset: 0; background: rgb(0 0 0 / 0.32); }
.doc-pane {
  position: absolute; top: 0; right: 0; bottom: 0; width: min(720px, 92vw);
  display: flex; flex-direction: column;
  background: var(--paper, #fff); border-left: 1px solid rgb(0 0 0 / 0.08);
  box-shadow: -12px 0 40px rgb(0 0 0 / 0.18);
}
.doc-pane-bar { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid rgb(0 0 0 / 0.08); background: inherit; }
.doc-pane-frame { flex: 1; border: 0; width: 100%; background: #fff; }
</style>

<style>
/* injected into the same-origin document — scoped styles cannot cross the frame boundary */
.rag-pane-highlight { outline: 3px solid rgba(37, 99, 235, 0.55); outline-offset: 4px; border-radius: 2px; background: rgba(37, 99, 235, 0.06); }
</style>

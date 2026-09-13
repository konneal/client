<script setup lang="ts">
// Answer contract v2 — typed MKO blocks. The server validated every
// [[u:]] reference against the passages used; payloads arrive from the
// producer (never through the LLM). Render table/formula/figure/term
// from the typed payload; unknown types render nothing.
import { computed } from "vue";

export interface UnitBlock {
  unit_id: string;
  type: string;
  docidentifier: string;
  edition?: string;
  payload: Record<string, any>;
}

const props = defineProps<{ blocks: UnitBlock[] }>();

const visible = computed(() => props.blocks.filter((b) => !!b.payload && Object.keys(b.payload).length > 0));

const cells = (b: UnitBlock): { cols: string[]; rows: string[][] } => {
  const cols: string[] = (b.payload.columns ?? []).map((c: any) => (typeof c === "string" ? c : c?.label ?? ""));
  const rows: string[][] = (b.payload.rows ?? []).map((r: any) =>
    typeof r === "string" ? r.split("|").map((s) => s.trim()) : Array.isArray(r) ? r.map(String) : [],
  );
  const width = Math.max(cols.length, ...rows.map((r) => r.length), 1);
  while (cols.length < width) cols.push("");
  return { cols, rows: rows.map((r) => { const rr = [...r]; while (rr.length < width) rr.push(""); return rr; }) };
};

const caption = (b: UnitBlock): string =>
  b.payload.caption || b.payload.description || b.payload.definition?.slice(0, 120) || "";
import FormulaBlock from "./FormulaBlock.vue";
</script>

<template>
  <div v-if="visible.length" class="blocks">
    <template v-for="b in visible" :key="b.unit_id">
      <!-- table -->
      <div v-if="b.type === 'table'" class="block card">
        <div class="block-head">
          <span class="src-badge">TABLE</span>
          <span class="block-src">{{ b.docidentifier }}{{ b.edition ? ` · ${b.edition}` : "" }}</span>
          <span v-if="caption(b)" class="block-cap">{{ caption(b) }}</span>
        </div>
        <table class="md-table unit-table">
          <thead><tr><th v-for="(c, i) in cells(b).cols" :key="i">{{ c }}</th></tr></thead>
          <tbody>
            <tr v-for="(r, ri) in cells(b).rows" :key="ri"><td v-for="(c, ci) in r" :key="ci">{{ c }}</td></tr>
          </tbody>
        </table>
      </div>

      <!-- formula -->
      <div v-else-if="b.type === 'formula'" class="block card">
        <div class="block-head">
          <span class="src-badge">FORMULA</span>
          <span class="block-src">{{ b.docidentifier }}</span>
        </div>
        <FormulaBlock :payload="b.payload" />
        <p v-if="b.payload.description" class="formula-desc">{{ b.payload.description }}</p>
      </div>

      <!-- figure -->
      <div v-else-if="b.type === 'figure'" class="block card">
        <div class="block-head">
          <span class="src-badge">FIGURE</span>
          <span class="block-src">{{ b.docidentifier }}</span>
          <span v-if="caption(b)" class="block-cap">{{ caption(b) }}</span>
        </div>
        <img v-if="b.payload.uri" :src="b.payload.uri" :alt="b.payload.alt || caption(b)" loading="lazy" class="unit-figure" />
        <p v-if="b.payload.description" class="formula-desc">{{ b.payload.description }}</p>
      </div>

      <!-- term -->
      <div v-else-if="b.type === 'term'" class="block card">
        <div class="block-head">
          <span class="src-badge">TERM</span>
          <span class="block-src">{{ b.docidentifier }}</span>
        </div>
        <p class="term-designations"><strong>{{ (b.payload.designations ?? []).join(" · ") || b.payload.concept }}</strong></p>
        <p v-if="b.payload.definition" class="formula-desc">{{ b.payload.definition }}</p>
      </div>

      <!-- verdict (frontier F1): executed conformance — the standard's own words -->
      <div v-else-if="b.type === 'verdict' || b.type === 'constraint'" class="block card">
        <div class="block-head">
          <span class="src-badge" :class="b.payload.verdict === 'pass' ? 'in-force' : 'src-badge'">{{ (b.type || 'CHECK').toUpperCase() }}</span>
          <span class="block-src">{{ b.docidentifier }}</span>
          <span v-if="b.payload.verdict" class="src-badge" :class="b.payload.verdict === 'pass' ? 'in-force' : 'withdrawn'">
            {{ b.payload.verdict }}{{ b.payload.on_violation ? ` · ${b.payload.on_violation}` : "" }}
          </span>
        </div>
        <code v-if="b.payload.check" class="formula-latex">{{ b.payload.check }}</code>
        <p v-if="b.payload.violation_meaning || b.payload.meaning" class="formula-desc">{{ b.payload.violation_meaning || b.payload.meaning }}</p>
      </div>

      <!-- calculation (F2/L8a): typed inputs → output -->
      <div v-else-if="b.type === 'calculation'" class="block card">
        <div class="block-head">
          <span class="src-badge">CALCULATION</span>
          <span class="block-src">{{ b.docidentifier }}</span>
          <span v-if="b.payload.identifier" class="block-cap">{{ b.payload.identifier }}</span>
        </div>
        <p v-if="b.payload.description" class="formula-desc">{{ b.payload.description }}</p>
        <ul v-if="b.payload.inputs?.length" class="text-xs mt-1 space-y-0.5">
          <li v-for="i in b.payload.inputs" :key="i.name" class="font-mono text-[0.7rem]">
            {{ i.name }} <span class="text-ink-muted">: {{ i.type }}{{ i.unit ? ` [${i.unit}]` : "" }}</span>
          </li>
        </ul>
      </div>

      <!-- sequence (L9a/F5): ordered steps with roles -->
      <div v-else-if="b.type === 'sequence'" class="block card">
        <div class="block-head">
          <span class="src-badge">SEQUENCE</span>
          <span class="block-src">{{ b.docidentifier }}</span>
        </div>
        <ol class="ml-4 list-decimal text-xs space-y-0.5">
          <li v-for="st in b.payload.steps ?? []" :key="st.order" class="font-mono text-[0.7rem]">
            {{ st.test || st.phase || st.name }}<span v-if="st.role" class="text-ink-muted"> ({{ st.role }})</span>
          </li>
        </ol>
      </div>

      <!-- registry cards: attribute / aspect / behavior / note -->
      <div v-else-if="['attribute', 'aspect', 'behavior', 'note', 'schema'].includes(b.type)" class="block card">
        <div class="block-head">
          <span class="src-badge">{{ b.type.toUpperCase() }}</span>
          <span class="block-src">{{ b.docidentifier }}</span>
        </div>
        <p v-if="b.payload.message || b.payload.definition || b.payload.description" class="formula-desc">
          {{ b.payload.message || b.payload.definition || b.payload.description }}
        </p>
        <p v-if="b.payload.value_type || b.payload.scope" class="font-mono text-[0.7rem] text-ink-muted mt-1">
          {{ [b.payload.value_type, b.payload.scope && `scope: ${b.payload.scope}`, b.payload.origin].filter(Boolean).join(" · ") }}
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.blocks { display: grid; gap: 0.6rem; margin: 0.5rem 0; }
.card { border: 1px solid var(--color-rule); border-radius: 0.6rem; padding: 0.6rem 0.75rem; background: var(--color-paper); }
.block-head { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.35rem; flex-wrap: wrap; }
.block-cap { color: var(--color-ink-soft); font-size: 0.82rem; }
.block-src { color: var(--color-ink-muted); font-size: 0.75rem; }
.unit-table { font-size: 0.8rem; }
.unit-figure { max-width: 100%; border-radius: 0.4rem; border: 1px solid var(--color-rule); }
.formula-latex { font-family: var(--font-mono, monospace); font-size: 0.85rem; background: color-mix(in srgb, var(--color-rule) 12%, transparent); padding: 0.3rem 0.5rem; border-radius: 0.4rem; display: inline-block; }
.formula-desc { margin: 0.35rem 0 0; font-size: 0.85rem; color: var(--color-ink-soft); }
.term-designations { margin: 0 0 0.2rem; font-size: 0.9rem; }
</style>

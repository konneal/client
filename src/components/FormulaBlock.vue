<script setup lang="ts">
// Formula rendering (the math half of the typed-object contract): the
// producer's payload carries serialized MathML and AsciiMath; MathML is
// rendered natively (every modern browser), and plurimath — the corpus
// ecosystem's own converter — is the conversion authority when MathML
// is missing (asciimath → MathML, dynamically imported so only
// formula-bearing sessions pay the bundle). The final fallback is the
// AsciiMath source as text — never a silent blank.
import { computed, ref, onMounted } from "vue";

const props = defineProps<{ payload: Record<string, unknown> }>();

const converted = ref<string | null>(null);
const mathml = computed(() => {
  const stored = typeof props.payload.mathml === "string" ? props.payload.mathml : "";
  return stored.includes("<math") ? stored : converted.value;
});
const asciimath = computed(() =>
  typeof props.payload.asciimath === "string" ? props.payload.asciimath : typeof props.payload.latex === "string" ? props.payload.latex : "",
);

onMounted(async () => {
  if (mathml.value || !asciimath.value) return;
  try {
    const mod = await import("@plurimath/plurimath");
    // producer-owned payload, our own pipeline — trusted markup, the
    // same trust class as every typed block payload
    converted.value = new mod.default(asciimath.value, "asciimath").toMathml();
  } catch {
    // conversion unavailable — the <code> fallback renders
  }
});
</script>

<template>
  <div v-if="mathml" class="formula-math" v-html="mathml"></div>
  <code v-else class="formula-latex">{{ asciimath }}</code>
</template>

<style scoped>
.formula-math :deep(math) {
  display: block;
  font-size: 1.05rem;
  padding: 0.4rem 0;
  overflow-x: auto;
}
</style>

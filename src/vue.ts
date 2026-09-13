// The Vue surface: contract-bound renderers (source chips, typed unit
// blocks, formula, the in-context document pane). Source-shipped — the
// consumer's Vite compiles the SFCs (exclude the package from dep
// optimization; see README).
export { default as SourceChips } from "./components/SourceChips.vue";
export { default as FormulaBlock } from "./components/FormulaBlock.vue";
export { default as UnitBlocks } from "./components/UnitBlocks.vue";
export { default as DocPane } from "./components/DocPane.vue";

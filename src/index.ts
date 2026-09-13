// @konneal/client — the publisher-site contract with the engine API:
// wire types, the SSE ask client, the escape-first markdown renderer,
// citation presentation, and the rendered-document deep-link layer.
// Publisher-neutral by construction: every publisher fact arrives as a
// parameter (citation label prefix) or from the deployment's own HTML.
export * from "./types";
export * from "./ask";
export * from "./citations";
export * from "./markdown";
export * from "./docs";

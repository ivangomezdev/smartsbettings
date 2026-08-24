export const PROCESSING_STATES = Object.freeze([
  "Interpretando consulta…",
  "Resolviendo partido…",
  "Consultando datos deportivos…",
  "Preparando el modelo…",
  "Construyendo la explicación…",
]);

export function resolvePredictionsView(searchParams) {
  return searchParams?.get?.("view") === "picks" ? "picks" : "chat";
}

export function shouldSubmitChatOnKeyDown(event) {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PROCESSING_STATES, resolvePredictionsView, shouldSubmitChatOnKeyDown } from "../../components/PredictionsHub/helpers.js";

test("hub abre Chat por defecto y conserva Picks por query param", () => {
  assert.equal(resolvePredictionsView(new URLSearchParams()), "chat");
  assert.equal(resolvePredictionsView(new URLSearchParams("view=picks")), "picks");
  assert.equal(resolvePredictionsView(new URLSearchParams("view=otro")), "chat");
});

test("Enter envía, Shift+Enter crea una línea y composición no envía", () => {
  assert.equal(shouldSubmitChatOnKeyDown({ key: "Enter", shiftKey: false, isComposing: false }), true);
  assert.equal(shouldSubmitChatOnKeyDown({ key: "Enter", shiftKey: true, isComposing: false }), false);
  assert.equal(shouldSubmitChatOnKeyDown({ key: "Enter", shiftKey: false, isComposing: true }), false);
  assert.equal(PROCESSING_STATES.length, 5);
});

test("resultado visual incluye todas las secciones auditables y el aviso de edge", async () => {
  const source = await readFile(new URL("../../components/PredictionResult/PredictionResult.jsx", import.meta.url), "utf8");
  for (const label of ["Últimos 6", "Casa / fuera", "Estadísticas", "H2H", "Bajas y disponibilidad", "Alineaciones", "Rotaciones y noticias", "Información no disponible", "Fuentes"]) assert.match(source, new RegExp(label));
  assert.match(source, /edge es experimental/);
  assert.match(source, /no demuestran rentabilidad sostenida/);
  assert.match(source, /fallbackUsed/);
});

test("hub contiene estados loading/error, aclaraciones, historial, nueva conversación y controles móviles", async () => {
  const [hub, css] = await Promise.all([
    readFile(new URL("../../components/PredictionsHub/PredictionsHub.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/PredictionsHub/PredictionsHub.css", import.meta.url), "utf8"),
  ]);
  for (const contract of ["Nueva conversación", "Cargando conversación", "predictions-chat__choices", "kind === \"error\"", "PredictionResult", "refreshHistory", "selectConversation"]) assert.match(hub, new RegExp(contract));
  assert.match(css, /history\.is-open/);
  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(hub, /maxLength=\{500\}/);
});

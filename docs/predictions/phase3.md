# Predictions — Fase 3

La vista `/predictions` abre Chat por defecto y conserva el feed anterior en `/predictions?view=picks`. El POST del chat ejecuta autenticación y plan, validación, parser, resolución, datos estructurados, Brave, market router, predictor, explicación y persistencia. Las probabilidades, cuotas justas, edge, confidence y versión del modelo proceden siempre del predictor; el LLM solo completa texto validado.

## LLM

- Provider inicial: OpenAI Responses API.
- Modelo predeterminado: `gpt-5-mini`.
- Prompt actual: `football-predictions-explainer-v2` (V1 se conserva como versión histórica).
- Salida: JSON Schema estricto y validación local.
- Timeout: 20 segundos.
- Caché: PostgreSQL, 24 horas, fingerprint de análisis, predicción, contexto, prompt, provider y modelo.
- Fallback: respuesta determinista marcada `LLM_FALLBACK_USED` ante configuración ausente, timeout, 429 o respuesta inválida.

Configurar únicamente en servidor:

```dotenv
PREDICTIONS_LLM_PROVIDER=openai
PREDICTIONS_LLM_MODEL=gpt-5-mini
OPENAI_API_KEY=
```

## Seguridad y consumo

El contenido web se serializa en un bloque no confiable separado y sus delimitadores se neutralizan. No se registran prompts completos, credenciales ni respuestas raw de error. El POST usa ownership, control de plan, same-origin, idempotency key y un límite PostgreSQL inicial de cinco solicitudes por usuario y minuto.

Cada análisis persiste el snapshot, predicción, router/modelo, webContext, fuentes, explicación, fingerprint, metadata del LLM y coste aproximado. En un hit de caché del LLM, `providerCalls` y coste incremental son cero.

## Verificación

```bash
npm test
npm run lint
npm run build:vercel
npm run build
npm run predictions:research -- "Newcastle United vs Liverpool" --repeat --date=2026-08-24
npm run verify:predictions:phase3 -- "Fulham vs Chelsea Over 1.5 August 24 2026"
```

El último comando aplica/verifica el esquema y ejecuta Over 1.5, 1X2, repetición de caché y fallback. Usa `PREDICTIONS_VERIFY_USER_ID` si se desea asociarlo a un usuario concreto; de lo contrario crea y elimina un usuario efímero de verificación. Nunca imprime identificadores de usuario ni claves.

La prueba OpenAI real solo se ejecuta cuando `OPENAI_API_KEY` está configurada. Si API-Football devuelve `SPORTS_API_PLAN_RESTRICTION`, debe habilitarse en ese proveedor la temporada del fixture elegido; el sistema no sustituye datos restringidos por información inventada.

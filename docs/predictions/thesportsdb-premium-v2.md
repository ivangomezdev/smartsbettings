# TheSportsDB Premium V2 en Predictions

## Enrutamiento

`SPORTS_CURRENT_PROVIDER=thesportsdb` selecciona TheSportsDB como fuente principal de datos deportivos actuales. `SPORTS_FALLBACK_PROVIDER=api-football` conserva API-Football como fallback controlado. Los modelos Poisson, el router de mercados, la calibración, los benchmarks, Brave y OpenAI permanecen separados de este routing.

La clave `THESPORTSDB_API_KEY` solo se lee en código server-side y se envía mediante `X-API-KEY`. No forma parte de URLs, errores públicos, logs ni payloads al cliente.

## Endpoints V2 oficiales usados

Base URL: `https://www.thesportsdb.com/api/v2/json`.

- `search/team/{name}` y `lookup/team/{id}`
- `search/event/{name}` y `lookup/event/{id}`
- `schedule/next/team/{id}`, `schedule/previous/team/{id}` y `schedule/full/team/{id}`
- `schedule/league/{leagueId}/{season}`
- `lookup/event_stats/{eventId}`
- `lookup/event_lineup/{eventId}`
- `lookup/event_timeline/{eventId}`
- `list/players/{teamId}`
- `livescore/soccer` y `livescore/league/{leagueId}`

No se usan endpoints no documentados para lesiones u odds. Cuando faltan esos datos se registra `provider_not_supported`; la capa de web research puede investigar después, sin alterar las probabilidades.

## Normalización y provenance

El adaptador convierte respuestas V2 al contrato deportivo interno existente. Los IDs no se mezclan:

```js
providerIds: {
  theSportsDb: { teamId, eventId, leagueId },
  apiFootball: { teamId, eventId }
}
```

Cada evento, equipo, estadística, lineup y elemento de timeline conserva provenance `sports_api/thesportsdb`. Una alineación de TheSportsDB se marca `UNKNOWN` porque el endpoint no distingue explícitamente entre confirmada, probable o proyectada.

La cobertura del snapshot es observada a partir de respuestas reales; no se interpreta la existencia de un endpoint como garantía de datos para una liga o evento.

## Caché, cuota y fallback

La caché PostgreSQL existente incluye el proveedor en su clave, por lo que TheSportsDB y API-Football nunca comparten entradas. Se mantienen los TTL centrales de equipos, fixtures, forma reciente, estadísticas completadas, lineups y resultados vacíos. Las solicitudes simultáneas idénticas siguen deduplicadas por lease/in-flight.

TheSportsDB usa un límite local configurable (`THESPORTSDB_MINUTE_BUDGET`, 90 por defecto) por debajo del límite Premium documentado de 100/minuto. `THESPORTSDB_DAILY_BUDGET` permite fijar además un presupuesto interno. Cada snapshot guarda `providerUsage` con `providerCalls` y `cacheHits` separados.

El fallback no mezcla IDs. Si la resolución primaria completa queda en TheSportsDB, los recursos dependientes de IDs continúan fijados a ese proveedor. H2H puede consultar API-Football únicamente cuando existen IDs oficiales de ambos proveedores y la reconstrucción estructurada de TheSportsDB está vacía. Las restricciones de plan se registran una vez y no se reintentan en bucle.

## Verificación manual

```bash
npm run predictions:thesportsdb -- "Newcastle United vs West Bromwich Albion" --date=2026-08-26
```

La salida está sanitizada e incluye fixture resuelto, provider IDs, cobertura observada, muestras, datos faltantes, fuentes, llamadas al proveedor y cache hits. Al repetir exactamente el comando dentro de los TTL, `providerCalls` debe ser `0` y `cacheHits` debe aumentar.

## Limitaciones observadas

- No hay endpoints Premium V2 oficiales documentados para lesiones ni odds.
- `schedule/full/team` no garantiza H2H histórico suficiente; el sistema lo reconstruye solo si los calendarios devuelven encuentros coincidentes y, cuando es seguro por IDs, puede usar el fallback.
- Estadísticas, lineups y timeline dependen de cobertura real por evento.
- La ausencia de `xG` se conserva como dato faltante; nunca se deriva de tiros ni de otras métricas.

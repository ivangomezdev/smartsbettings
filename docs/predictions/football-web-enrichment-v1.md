# football-web-enrichment-v1

La capa web se ejecuta antes de `predictionService`, nunca dentro de Poisson. Su salida se añade en `snapshot.enrichment.web` y no reemplaza datos estructurados ni modifica lambdas, probabilidades, fair odds o edge.

## Activación y presupuesto

El planner crea búsquedas específicas solo ante datos faltantes, fixtures futuros, análisis profundo o conflictos estructurados. El límite inicial es 8 búsquedas, 20 resultados y 10 segundos por análisis. Al agotarse se emite `WEB_RESEARCH_BUDGET_EXHAUSTED`; un timeout emite `WEB_RESEARCH_TIMEOUT` y el análisis puede continuar.

## Fuente y recencia

Tier 1 corresponde a fuentes oficiales; Tier 2 a medios/proveedores reconocidos; Tier 3 a fuentes locales o periodistas identificables; Tier 4 a agregadores, blogs, foros o social no verificado. Una fuente Tier 4 nunca basta por sí sola para evidencia crítica. La configuración central define TTL de 12 minutos para alineación confirmada, 45 minutos para probable/clima, 2 horas para lesiones/noticias y 8 horas para sanciones.

Solo se conservan evidencia resumida, URL, timestamps, tier y provenance. El texto web se trata como no confiable, se limita y sanitiza; nunca recibe secretos ni controla instrucciones.

## Proveedor

El contrato `webSearchProvider` sigue siendo inyectable y conserva el mock para tests. El adaptador real inicial es Brave Search y se habilita solo en servidor con `WEB_RESEARCH_PROVIDER=brave` y `BRAVE_SEARCH_API_KEY`. Las investigaciones recientes usan el endpoint de noticias; resultados históricos usan búsqueda web normal. El adaptador no asigna tiers por posición: la clasificación sigue dependiendo del registro de dominios confiables.

`npm run predictions:research -- "Real Madrid vs Sevilla" --repeat` ejecuta dos investigaciones idénticas y muestra consultas, evidencia, fuentes, conflictos y métricas. Con PostgreSQL configurado, la primera debe reportar llamadas `provider` y la segunda `cache`, sin llamadas adicionales a Brave. `--date=2026-08-24` permite fijar la fecha del fixture. Nunca se imprime la clave.

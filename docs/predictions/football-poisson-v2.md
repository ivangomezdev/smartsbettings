# football-poisson-v2

`football-poisson-v2` conserva las fuentes y pesos 45/35/10/10 de V1. No usa cuotas como entrada y no reemplaza automáticamente a V1.

## Ajustes auditables

- **Shrinkage:** `lambda' = n/(n+k) * lambda + k/(n+k) * mediaCompeticion`. La grilla valida `k ∈ {3, 8, 15}`.
- **Ventaja local:** se estima como goles locales/goles visitantes usando solo temporadas de entrenamiento. Se valida fuerza `s ∈ {0, 0.5, 1}` y se aplica `home *= ratio^(s/2)`, `away /= ratio^(s/2)`.
- **Dixon–Coles:** corrige 0-0, 0-1, 1-0 y 1-1 con `rho ∈ {-0.08, 0, 0.08}` y renormaliza la matriz.
- **Límites:** lambdas finales se acotan a `[0.2, 4.5]` para estabilidad numérica.
- **Calibración:** Platt por mercado sobre predicciones de train+validation. Over/Under se normalizan como pares complementarios; home/draw/away se renormalizan al simplex 1X2.

La selección minimiza una combinación fija de Brier y Log Loss en validation. ROI y cuotas no intervienen en el ajuste.

## Protocolo temporal

Con cinco temporadas se ejecutan tres folds rolling-origin. En cada uno, train precede a validation y validation precede a test. La última temporada es el holdout final intacto. Una aserción rechaza cualquier calibración cuya fecha final alcance el inicio del test.

## Promoción

- `SUPPORTED_V2`: supera ambos baselines en holdout, no degrada V1 en más de 0.005 en Brier y Log Loss, mantiene calibración y gana al menos 60% de segmentos rolling/liga.
- `NOT_RECOMMENDED_V2`: pierde de forma consistente contra ambos baselines o degrada V1 de forma repetida.
- Los demás casos son `WEAK_V2`.

La recomendación global puede ser `PROMOTE_V2`, `KEEP_V1` o `NEEDS_ML`. Una degradación simultánea mayor a 0.005 en Brier y Log Loss de 1X2 fuerza `KEEP_V1`. Es informativa: el default de producción continúa siendo V1.

La configuración candidata elegida queda registrada con dataset `bde4a15…bed54` y fingerprint `c53c043…3bc4`. `predictionService` la usa únicamente cuando el llamador pide explícitamente `football-poisson-v2`; si no se indica versión, ejecuta V1.

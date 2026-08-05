# Base de datos de cuentas

El registro usa PostgreSQL mediante Neon y la variable `DATABASE_URL`.

## Configuración en Vercel

1. Abre el proyecto en Vercel y entra a **Storage**.
2. Crea o conecta una base de datos **Neon Postgres** desde el Marketplace.
3. Confirma que la integración haya agregado `DATABASE_URL` al proyecto para Production, Preview y Development.
4. Vuelve a desplegar la aplicación.

Las tablas `sb_users`, `sb_sessions` y `sb_predictions` se crean automáticamente en la primera solicitud. El esquema también está disponible en `db/schema.sql` para ejecutarlo manualmente.

Para desarrollo local, copia `.env.example` a `.env.local` y reemplaza el valor por la cadena de conexión de Neon. Nunca subas `.env.local` al repositorio.

## Seguridad incluida

- Contraseñas protegidas con bcrypt (12 rondas).
- Sesiones opacas almacenadas en base de datos y enviadas en cookie `HttpOnly`.
- Cookies `Secure` en producción y `SameSite=Lax`.
- Bloqueo de 15 minutos después de cinco intentos fallidos.
- Validación de origen en todas las solicitudes que modifican datos.

El checkout mostrado después de elegir un plan es únicamente una demostración: la red, la billetera y el contenido del QR no pueden recibir pagos.

## Panel de administración y capturas

1. Configura `ADMIN_API_KEY` en Vercel con una clave larga y aleatoria.
2. En Vercel Storage crea un almacén **Blob** y conéctalo al proyecto. La integración agregará `BLOB_READ_WRITE_TOKEN`.
3. Vuelve a desplegar y abre `/admin`.

El administrador inicia sesión con `ADMIN_API_KEY` y desde el panel puede publicar la apuesta, cuota, análisis, casa de apuestas, enlace directo y una captura JPG, PNG o WEBP de hasta 5 MB.

## Enlace de referido de Hard Rock Bet

Configura `NEXT_PUBLIC_HARD_ROCK_REFERRAL_URL` en Vercel con el enlace de referido real. La sección privada `/primeros-pasos` mostrará únicamente el logo de Hard Rock Bet y usará esa dirección al presionarlo. Si la variable no existe, se abrirá el sitio oficial sin referido.

También se pueden publicar picks mediante `POST /api/admin/predictions`, enviando la clave como `Authorization: Bearer TU_CLAVE`. Para subir una captura, usa `multipart/form-data`; sin captura también acepta un JSON con esta estructura:

```json
{
  "sport": "Fútbol",
  "league": "Champions League",
  "eventName": "Equipo A vs Equipo B",
  "pick": "Más de 2.5 goles",
  "bookmaker": "Bet365",
  "odds": 1.85,
  "analysis": "Descripción privada del análisis.",
  "betLink": "https://casa-de-apuestas.com/evento",
  "startsAt": "2026-08-10T20:00:00.000Z",
  "allowedPlans": ["starter", "predicciones"]
}
```

La ruta administrativa no aparece dentro del dashboard de los usuarios y rechaza solicitudes sin la clave configurada.

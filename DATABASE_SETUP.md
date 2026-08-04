# Base de datos de cuentas

El registro usa PostgreSQL mediante Neon y la variable `DATABASE_URL`.

## Configuración en Vercel

1. Abre el proyecto en Vercel y entra a **Storage**.
2. Crea o conecta una base de datos **Neon Postgres** desde el Marketplace.
3. Confirma que la integración haya agregado `DATABASE_URL` al proyecto para Production, Preview y Development.
4. Vuelve a desplegar la aplicación.

Las tablas `sb_users` y `sb_sessions` se crean automáticamente en la primera solicitud. El esquema también está disponible en `db/schema.sql` para ejecutarlo manualmente.

Para desarrollo local, copia `.env.example` a `.env.local` y reemplaza el valor por la cadena de conexión de Neon. Nunca subas `.env.local` al repositorio.

## Seguridad incluida

- Contraseñas protegidas con bcrypt (12 rondas).
- Sesiones opacas almacenadas en base de datos y enviadas en cookie `HttpOnly`.
- Cookies `Secure` en producción y `SameSite=Lax`.
- Bloqueo de 15 minutos después de cinco intentos fallidos.
- Validación de origen en todas las solicitudes que modifican datos.

El checkout mostrado después de elegir un plan es únicamente una demostración: la red, la billetera y el contenido del QR no pueden recibir pagos.

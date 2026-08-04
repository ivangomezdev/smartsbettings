import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "./db.js";

export function json(body, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function handleApiError(error) {
  if (error instanceof DatabaseConfigurationError) {
    return json(
      {
        error:
          "El registro estará disponible cuando el administrador conecte DATABASE_URL en Vercel.",
      },
      503,
    );
  }

  console.error(error);
  return json({ error: "No pudimos completar la solicitud. Inténtalo nuevamente." }, 500);
}

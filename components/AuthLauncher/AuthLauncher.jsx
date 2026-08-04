"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FiArrowUpRight, FiX } from "react-icons/fi";

export function AuthLauncher() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (window.location.search.includes("registro=1")) {
      const openTimer = window.setTimeout(() => setOpen(true), 0);
      return () => window.clearTimeout(openTimer);
    }
    return undefined;
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (pathname === "/planes") {
    return null;
  }

  const openFlow = async () => {
    setError("");

    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (response.ok) {
        router.push("/planes");
        return;
      }
    } catch {
      // El formulario mostrará cualquier error de conexión al enviar.
    }

    setMode("register");
    setOpen(true);
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(`/api/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "No pudimos completar el acceso.");
        return;
      }

      setOpen(false);
      router.push("/planes");
    } catch {
      setError("No pudimos conectar con el servidor. Inténtalo nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button className="auth-launcher" type="button" onClick={openFlow}>
        <span className="auth-launcher__coin" aria-hidden="true">$</span>
        <span>Empieza a ganar dinero</span>
        <FiArrowUpRight aria-hidden="true" />
      </button>

      {open ? (
        <div className="auth-modal" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="auth-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="auth-modal__close"
              type="button"
              aria-label="Cerrar"
              onClick={() => setOpen(false)}
            >
              <FiX aria-hidden="true" />
            </button>
            <p className="auth-modal__eyebrow">SMARTBETTING ACCESS</p>
            <h2 id="auth-modal-title">
              {mode === "register" ? "Crea tu cuenta" : "Bienvenido de vuelta"}
            </h2>
            <p className="auth-modal__copy">
              {mode === "register"
                ? "Regístrate y elige el plan que se adapta a tu estrategia."
                : "Ingresa para continuar con tu selección de plan."}
            </p>

            <div className="auth-modal__tabs" role="tablist" aria-label="Acceso a la cuenta">
              <button
                className={mode === "register" ? "is-active" : ""}
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                onClick={() => switchMode("register")}
              >
                Crear cuenta
              </button>
              <button
                className={mode === "login" ? "is-active" : ""}
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                onClick={() => switchMode("login")}
              >
                Ya tengo cuenta
              </button>
            </div>

            <form className="auth-modal__form" onSubmit={submit}>
              <label>
                Usuario
                <input
                  name="username"
                  type="text"
                  minLength={3}
                  maxLength={30}
                  autoComplete="username"
                  placeholder="Tu usuario"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label>
                Contraseña
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  maxLength={72}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              {error ? <p className="auth-modal__error" role="alert">{error}</p> : null}
              <button className="auth-modal__submit" type="submit" disabled={submitting}>
                {submitting
                  ? "Procesando…"
                  : mode === "register"
                    ? "Crear cuenta y elegir plan"
                    : "Ingresar y continuar"}
              </button>
            </form>
            <p className="auth-modal__privacy">
              Tu contraseña se almacena protegida mediante hash y nunca se muestra en texto plano.
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}

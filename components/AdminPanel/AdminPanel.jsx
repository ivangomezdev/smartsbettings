"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  FiActivity,
  FiCalendar,
  FiCheck,
  FiExternalLink,
  FiImage,
  FiLink,
  FiLock,
  FiLogOut,
  FiSend,
  FiTarget,
  FiTrash2,
  FiTrendingUp,
  FiUploadCloud,
} from "react-icons/fi";

const initialForm = {
  sport: "",
  league: "",
  eventName: "",
  pick: "",
  bookmaker: "",
  odds: "",
  analysis: "",
  startsAt: "",
  betLink: "",
  allowedPlans: ["starter", "predicciones"],
};

export function AdminPanel() {
  const [sessionState, setSessionState] = useState("loading");
  const [configurationError, setConfigurationError] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [ticket, setTicket] = useState(null);
  const [ticketPreview, setTicketPreview] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [loadingPredictions, setLoadingPredictions] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState({ type: "", message: "" });
  const [deletingId, setDeletingId] = useState("");

  const loadPredictions = async () => {
    setLoadingPredictions(true);
    try {
      const response = await fetch("/api/admin/predictions", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) {
        setSessionState("anonymous");
        return;
      }
      if (!response.ok) throw new Error(data.error || "No pudimos cargar los picks.");
      setPredictions(data.predictions);
    } catch (error) {
      setPublishStatus({ type: "error", message: error.message });
    } finally {
      setLoadingPredictions(false);
    }
  };

  useEffect(() => {
    let active = true;
    const verifySession = async () => {
      try {
        const response = await fetch("/api/admin/auth/session", { cache: "no-store" });
        const data = await response.json();
        if (!active) return;
        if (response.ok && data.authenticated) {
          setSessionState("authenticated");
          return;
        }
        if (data.configured === false) setConfigurationError("Configura ADMIN_API_KEY antes de abrir el panel.");
        setSessionState("anonymous");
      } catch {
        if (active) {
          setConfigurationError("No pudimos comprobar la configuración del administrador.");
          setSessionState("anonymous");
        }
      }
    };
    verifySession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (sessionState !== "authenticated") return;
    const loadTimer = window.setTimeout(loadPredictions, 0);
    return () => window.clearTimeout(loadTimer);
  }, [sessionState]);

  useEffect(() => () => {
    if (ticketPreview) URL.revokeObjectURL(ticketPreview);
  }, [ticketPreview]);

  const login = async (event) => {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos iniciar la sesión.");
      setPassword("");
      setSessionState("authenticated");
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST" }).catch(() => null);
    setSessionState("anonymous");
  };

  const chooseTicket = (event) => {
    const file = event.target.files?.[0] || null;
    if (ticketPreview) URL.revokeObjectURL(ticketPreview);
    setTicket(file);
    setTicketPreview(file ? URL.createObjectURL(file) : "");
  };

  const togglePlan = (planId) => {
    setForm((current) => ({
      ...current,
      allowedPlans: current.allowedPlans.includes(planId)
        ? current.allowedPlans.filter((id) => id !== planId)
        : [...current.allowedPlans, planId],
    }));
  };

  const publish = async (event) => {
    event.preventDefault();
    setPublishing(true);
    setPublishStatus({ type: "", message: "" });

    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (key === "allowedPlans") value.forEach((planId) => payload.append(key, planId));
        else if (key === "startsAt") payload.set(key, new Date(value).toISOString());
        else payload.set(key, value);
      });
      if (ticket) payload.set("ticket", ticket);

      const response = await fetch("/api/admin/predictions", { method: "POST", body: payload });
      const data = await response.json();
      if (response.status === 401) {
        setSessionState("anonymous");
        throw new Error("Tu sesión expiró. Vuelve a ingresar.");
      }
      if (!response.ok) throw new Error(data.error || "No pudimos publicar el pick.");

      setPredictions((current) => [{ ...data.prediction, createdAt: new Date().toISOString() }, ...current]);
      setForm(initialForm);
      setTicket(null);
      if (ticketPreview) URL.revokeObjectURL(ticketPreview);
      setTicketPreview("");
      setPublishStatus({ type: "success", message: "Pick publicado y visible para los planes seleccionados." });
    } catch (error) {
      setPublishStatus({ type: "error", message: error.message });
    } finally {
      setPublishing(false);
    }
  };

  const removePrediction = async (id) => {
    if (!window.confirm("¿Eliminar este pick y su captura? Esta acción no se puede deshacer.")) return;
    setDeletingId(id);
    try {
      const response = await fetch(`/api/admin/predictions/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos eliminar el pick.");
      setPredictions((current) => current.filter((prediction) => prediction.id !== id));
    } catch (error) {
      setPublishStatus({ type: "error", message: error.message });
    } finally {
      setDeletingId("");
    }
  };

  if (sessionState === "loading") {
    return <main className="admin-state"><span className="admin-state__loader" /><p>Verificando acceso…</p></main>;
  }

  if (sessionState === "anonymous") {
    return (
      <main className="admin-login">
        <section className="admin-login__card">
          <Link href="/" className="admin-login__brand">SMART<span>BETTING</span></Link>
          <span className="admin-login__icon"><FiLock aria-hidden="true" /></span>
          <p className="admin-login__eyebrow">ACCESO RESTRINGIDO</p>
          <h1>Panel de administración</h1>
          <p>Ingresa la clave privada para publicar picks.</p>
          <form onSubmit={login}>
            <label>Clave de administrador<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /></label>
            {configurationError || loginError ? <p className="admin-login__error" role="alert">{loginError || configurationError}</p> : null}
            <button type="submit" disabled={loggingIn || Boolean(configurationError)}>{loggingIn ? "Ingresando…" : "Entrar al panel"}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-panel">
      <header className="admin-panel__header">
        <Link href="/admin" className="admin-panel__brand">SMART<span>BETTING</span><small>ADMIN</small></Link>
        <button type="button" onClick={logout}><FiLogOut aria-hidden="true" /> Cerrar sesión</button>
      </header>

      <section className="admin-panel__intro">
        <div><p>CONTROL DE CONTENIDO</p><h1>Publicar nuevo pick</h1><span>Completa la apuesta exactamente como debe verla el usuario.</span></div>
        <span className="admin-panel__online"><i /> SISTEMA ACTIVO</span>
      </section>

      <div className="admin-panel__layout">
        <form className="pick-form" onSubmit={publish}>
          <section className="pick-form__section">
            <div className="pick-form__heading"><FiActivity aria-hidden="true" /><div><h2>Evento deportivo</h2><p>Identifica el partido y la hora de inicio.</p></div></div>
            <div className="pick-form__grid">
              <label>Deporte<input name="sport" value={form.sport} onChange={(event) => setForm((current) => ({ ...current, sport: event.target.value }))} placeholder="Fútbol" required maxLength={60} /></label>
              <label>Liga<input name="league" value={form.league} onChange={(event) => setForm((current) => ({ ...current, league: event.target.value }))} placeholder="Champions League" maxLength={100} /></label>
              <label className="pick-form__wide">Evento<input name="eventName" value={form.eventName} onChange={(event) => setForm((current) => ({ ...current, eventName: event.target.value }))} placeholder="Real Madrid vs Manchester City" required maxLength={180} /></label>
              <label>Fecha y hora<input name="startsAt" type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} required /></label>
              <label>Casa de apuesta<input name="bookmaker" value={form.bookmaker} onChange={(event) => setForm((current) => ({ ...current, bookmaker: event.target.value }))} placeholder="Bet365" maxLength={100} /></label>
            </div>
          </section>

          <section className="pick-form__section">
            <div className="pick-form__heading"><FiTarget aria-hidden="true" /><div><h2>Apuesta y cuota</h2><p>Indica qué debe jugar el usuario.</p></div></div>
            <div className="pick-form__grid">
              <label className="pick-form__wide">Apuesta recomendada<input name="pick" value={form.pick} onChange={(event) => setForm((current) => ({ ...current, pick: event.target.value }))} placeholder="Más de 2.5 goles" required maxLength={220} /></label>
              <label>Cuota<div className="pick-form__icon-field"><FiTrendingUp /><input name="odds" type="number" step="0.001" min="1" max="1000" value={form.odds} onChange={(event) => setForm((current) => ({ ...current, odds: event.target.value }))} placeholder="1.85" /></div></label>
              <label>Link directo<div className="pick-form__icon-field"><FiLink /><input name="betLink" type="url" value={form.betLink} onChange={(event) => setForm((current) => ({ ...current, betLink: event.target.value }))} placeholder="https://casa.com/apuesta" /></div></label>
              <label className="pick-form__wide">Análisis<textarea name="analysis" value={form.analysis} onChange={(event) => setForm((current) => ({ ...current, analysis: event.target.value }))} placeholder="Explica brevemente por qué se recomienda esta selección…" maxLength={5000} rows={5} /></label>
            </div>
          </section>

          <section className="pick-form__section">
            <div className="pick-form__heading"><FiImage aria-hidden="true" /><div><h2>Ticket y visibilidad</h2><p>Adjunta una prueba visual y selecciona quién puede verla.</p></div></div>
            <label className="ticket-upload">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseTicket} />
              {ticketPreview ? <Image src={ticketPreview} alt="Vista previa del ticket" fill unoptimized /> : <><FiUploadCloud aria-hidden="true" /><strong>Subir captura del ticket</strong><span>JPG, PNG o WEBP · máximo 5 MB</span></>}
            </label>
            <fieldset className="plan-access"><legend>Visible para</legend>{["starter", "predicciones"].map((planId) => <label key={planId}><input type="checkbox" checked={form.allowedPlans.includes(planId)} onChange={() => togglePlan(planId)} /><span><FiCheck /> Plan {planId === "starter" ? "Starter" : "Predicciones"}</span></label>)}</fieldset>
          </section>

          {publishStatus.message ? <p className={`admin-message admin-message--${publishStatus.type}`} role="status">{publishStatus.message}</p> : null}
          <button className="pick-form__submit" type="submit" disabled={publishing || !form.allowedPlans.length}><FiSend aria-hidden="true" /> {publishing ? "Publicando…" : "Publicar pick"}</button>
        </form>

        <aside className="admin-publications">
          <div className="admin-publications__heading"><div><p>PUBLICACIONES</p><h2>Picks recientes</h2></div><span>{predictions.length}</span></div>
          {loadingPredictions ? <p className="admin-publications__empty">Cargando publicaciones…</p> : predictions.length === 0 ? <p className="admin-publications__empty">Todavía no publicaste ningún pick.</p> : <div className="admin-publications__list">{predictions.map((prediction) => <article className="admin-pick" key={prediction.id}>{prediction.ticketImageUrl ? <div className="admin-pick__image"><Image src={prediction.ticketImageUrl} alt={`Ticket de ${prediction.eventName}`} fill sizes="7rem" /></div> : <span className="admin-pick__no-image"><FiImage /></span>}<div className="admin-pick__content"><span>{prediction.sport} · {prediction.bookmaker || "Sin casa"}</span><h3>{prediction.eventName}</h3><strong>{prediction.pick}{prediction.odds ? ` · ${prediction.odds}` : ""}</strong><small><FiCalendar /> {new Date(prediction.startsAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small>{prediction.betLink ? <a href={prediction.betLink} target="_blank" rel="noopener noreferrer">Abrir apuesta <FiExternalLink /></a> : null}</div><button type="button" onClick={() => removePrediction(prediction.id)} disabled={deletingId === prediction.id} aria-label="Eliminar pick"><FiTrash2 /></button></article>)}</div>}
        </aside>
      </div>
    </main>
  );
}

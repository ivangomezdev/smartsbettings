"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FiClock, FiMenu, FiMessageSquare, FiPlus, FiSend, FiTarget, FiX } from "react-icons/fi";
import { PredictionResult } from "../PredictionResult/PredictionResult.jsx";
import { PredictionsFeed } from "../PredictionsFeed/PredictionsFeed.jsx";
import { PROCESSING_STATES, resolvePredictionsView, shouldSubmitChatOnKeyDown } from "./helpers.js";

async function api(path, options) {
  const response = await fetch(path, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "No fue posible completar la solicitud.");
    error.code = payload.code;
    error.redirectTo = payload.redirectTo;
    throw error;
  }
  return payload;
}

function storedResult(message) {
  return message?.payload?.result || null;
}

function ChatMessage({ message, onSelection, disabled }) {
  const result = storedResult(message);
  if (message.role === "user") return <div className="predictions-chat__message is-user"><p>{message.content}</p></div>;
  if (result?.kind === "analysis") return <div className="predictions-chat__message is-analysis"><PredictionResult analysis={result.analysis} /></div>;
  if (result?.kind === "clarification") return <div className="predictions-chat__message is-assistant"><p>{message.content}</p>{result.clarification?.options?.length ? <div className="predictions-chat__choices">{result.clarification.options.map((option) => <button disabled={disabled} key={`${option.type}-${option.id}`} onClick={() => onSelection(option)} type="button"><strong>{option.label}</strong>{option.date ? <span>{new Date(option.date).toLocaleString("es-MX")}</span> : null}</button>)}</div> : null}</div>;
  return <div className={`predictions-chat__message is-assistant${result?.kind === "error" ? " is-error" : ""}`}><p>{message.content}</p></div>;
}

export function PredictionsHub() {
  const searchParams = useSearchParams();
  const view = resolvePredictionsView(searchParams);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const endRef = useRef(null);

  const handleAccessError = useCallback((caught) => {
    setError(caught.message);
    if (caught.redirectTo) window.location.assign(caught.redirectTo);
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const data = await api("/api/predictions/conversations");
      setConversations(data.conversations || []);
    } catch (caught) { handleAccessError(caught); }
  }, [handleAccessError]);

  useEffect(() => { if (view === "chat") refreshHistory(); }, [refreshHistory, view]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);
  useEffect(() => {
    if (!busy) return undefined;
    setStatusIndex(0);
    const timer = setInterval(() => setStatusIndex((value) => Math.min(value + 1, PROCESSING_STATES.length - 1)), 1800);
    return () => clearInterval(timer);
  }, [busy]);

  async function selectConversation(id) {
    setLoadingHistory(true);
    setError("");
    try {
      const data = await api(`/api/predictions/conversations/${encodeURIComponent(id)}`);
      setConversationId(id);
      setMessages(data.conversation?.messages || []);
      setHistoryOpen(false);
    } catch (caught) { handleAccessError(caught); }
    finally { setLoadingHistory(false); }
  }

  function newConversation() {
    setConversationId(null);
    setMessages([]);
    setInput("");
    setError("");
    setHistoryOpen(false);
  }

  async function ensureConversation() {
    if (conversationId) return conversationId;
    const data = await api("/api/predictions/conversations", { method: "POST" });
    setConversationId(data.conversation.id);
    setConversations((items) => [data.conversation, ...items]);
    return data.conversation.id;
  }

  async function sendMessage(text, selection = null) {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError("");
    if (!selection) setMessages((items) => [...items, { id: `local-${Date.now()}`, role: "user", type: "text", content: clean, payload: {} }]);
    setInput("");
    try {
      const id = await ensureConversation();
      const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const result = await api("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestId },
        body: JSON.stringify({ conversationId: id, message: clean, selection }),
      });
      const assistant = { ...result.message, content: result.message?.content || result.analysis?.explanation?.summary?.conclusion || "Análisis completado.", payload: { result } };
      setMessages((items) => [...items, assistant]);
      await refreshHistory();
    } catch (caught) {
      handleAccessError(caught);
      setMessages((items) => [...items, { id: `error-${Date.now()}`, role: "assistant", type: "error", content: caught.message, payload: { result: { kind: "error" } } }]);
    } finally { setBusy(false); }
  }

  function submit(event) {
    event.preventDefault();
    sendMessage(input);
  }

  function choose(option) {
    const label = option.label || String(option.id);
    setMessages((items) => [...items, { id: `selection-${Date.now()}`, role: "user", type: "text", content: label, payload: {} }]);
    sendMessage(label, { type: option.type, id: String(option.id) });
  }

  if (view === "picks") return <main className="predictions-hub"><HubHeader view={view} /><PredictionsFeed /></main>;

  return <main className="predictions-hub">
    <HubHeader view={view} />
    <button className="predictions-chat__history-toggle" onClick={() => setHistoryOpen((value) => !value)} type="button">{historyOpen ? <FiX /> : <FiMenu />} Historial</button>
    <section className="predictions-chat">
      <aside className={`predictions-chat__history${historyOpen ? " is-open" : ""}`}>
        <button onClick={newConversation} type="button"><FiPlus /> Nueva conversación</button>
        <p><FiClock /> RECIENTES</p>
        {conversations.length ? <div className="predictions-chat__history-list">{conversations.map((item) => <button className={item.id === conversationId ? "is-active" : ""} disabled={loadingHistory || busy} key={item.id} onClick={() => selectConversation(item.id)} type="button"><strong>{item.title}</strong><span>{new Date(item.updatedAt).toLocaleDateString("es-MX")}</span></button>)}</div> : <div className="predictions-chat__empty-history">Tus análisis aparecerán aquí.</div>}
      </aside>
      <div className="predictions-chat__workspace">
        <div aria-live="polite" className="predictions-chat__messages">
          {!messages.length && !loadingHistory ? <div className="predictions-chat__welcome">
            <span><FiMessageSquare /></span><p>ANALISTA ESTADÍSTICO</p><h2>¿Qué partido quieres analizar?</h2>
            <p>Incluye el evento y mercado. Revisaremos forma, contexto reciente y el modelo histórico correspondiente.</p>
            <div><button onClick={() => setInput("Real Madrid vs Sevilla Over 1.5")} type="button">Real Madrid vs Sevilla Over 1.5</button><button onClick={() => setInput("Liverpool vs Arsenal BTTS")} type="button">Liverpool vs Arsenal BTTS</button></div>
          </div> : null}
          {loadingHistory ? <div className="predictions-chat__processing"><span /> Cargando conversación…</div> : messages.map((message) => <ChatMessage disabled={busy} key={message.id} message={message} onSelection={choose} />)}
          {busy ? <div className="predictions-chat__processing"><span /> {PROCESSING_STATES[statusIndex]}</div> : null}
          <div ref={endRef} />
        </div>
        {error ? <p className="predictions-chat__error" role="alert">{error}</p> : null}
        <form className="predictions-chat__composer" onSubmit={submit}>
          <textarea aria-label="Consulta de predicción" disabled={busy} maxLength={500} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (shouldSubmitChatOnKeyDown(event)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ejemplo: Real Madrid vs Sevilla Over 1.5" rows={2} value={input} />
          <span className={input.length >= 450 ? "is-near-limit" : ""}>{input.length}/500</span>
          <button aria-label="Enviar consulta" disabled={busy || !input.trim()} type="submit"><FiSend /></button>
        </form>
        <p className="predictions-chat__disclaimer">Las probabilidades son estimaciones estadísticas y no garantizan resultados futuros.</p>
      </div>
    </section>
  </main>;
}

function HubHeader({ view }) {
  return <header className="predictions-hub__header"><div><p>ANÁLISIS DE FÚTBOL</p><h1>Predictions</h1><span>Pregunta por un partido y recibe una lectura estadística completa.</span></div><nav aria-label="Vistas de Predictions" className="predictions-hub__tabs"><Link className={view === "chat" ? "is-active" : ""} href="/predictions?view=chat"><FiMessageSquare /> Chat</Link><Link className={view === "picks" ? "is-active" : ""} href="/predictions?view=picks"><FiTarget /> Picks</Link></nav></header>;
}

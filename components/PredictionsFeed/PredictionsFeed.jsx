"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiActivity, FiArrowUpRight, FiCalendar, FiExternalLink, FiTarget, FiTrendingUp } from "react-icons/fi";
import { useUserAccount } from "../UserShell/UserShell.jsx";

export function PredictionsFeed() {
  const { user } = useUserAccount();
  const router = useRouter();
  const [predictions, setPredictions] = useState([]);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadPredictions = async () => {
      try {
        const response = await fetch("/api/predictions", { cache: "no-store" });
        const data = await response.json();

        if (response.status === 401) {
          router.replace("/?registro=1&returnTo=%2Fpredictions");
          return;
        }
        if (response.status === 402 && data.redirectTo) {
          router.replace(data.redirectTo);
          return;
        }
        if (!response.ok) throw new Error(data.error || "No pudimos cargar los picks.");

        if (active) {
          setPredictions(data.predictions);
          setPlan(data.plan);
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPredictions();
    return () => {
      active = false;
    };
  }, [router, user.selectedPlan, user.planStatus]);

  return (
    <main className="predictions-feed">
      <header className="predictions-feed__hero">
        <div>
          <p>PICKS PRIVADOS</p>
          <h1>Predicciones</h1>
          <span>Selecciones cargadas por el equipo para tu plan activo.</span>
        </div>
        {plan ? <span className="predictions-feed__plan">PLAN {plan.name.toUpperCase()}</span> : null}
      </header>

      {loading ? (
        <section className="predictions-feed__state">
          <span className="predictions-feed__loader" aria-hidden="true" />
          <p>Cargando los picks disponibles…</p>
        </section>
      ) : error ? (
        <section className="predictions-feed__state predictions-feed__state--error">
          <FiActivity aria-hidden="true" />
          <h2>No pudimos cargar las predicciones</h2>
          <p>{error}</p>
        </section>
      ) : predictions.length === 0 ? (
        <section className="predictions-feed__state">
          <span className="predictions-feed__empty-icon"><FiTarget aria-hidden="true" /></span>
          <p className="predictions-feed__state-eyebrow">RADAR ACTIVO</p>
          <h2>Aún no hay picks publicados</h2>
          <p>Tu plan está activo. Las nuevas selecciones aparecerán aquí cuando el equipo las publique.</p>
          <Link href="/user">Volver al dashboard <FiArrowUpRight aria-hidden="true" /></Link>
        </section>
      ) : (
        <section className="predictions-feed__grid" aria-label="Picks disponibles">
          {predictions.map((prediction) => {
            const startDate = new Date(prediction.startsAt);
            const started = startDate <= new Date();
            return (
              <article className="prediction-card" key={prediction.id}>
                <div className="prediction-card__topline">
                  <span>{prediction.sport}</span>
                  <span className={started ? "is-live" : ""}>{started ? "INICIADO" : "PRÓXIMO"}</span>
                </div>
                <p className="prediction-card__league">{prediction.league || "Evento deportivo"}</p>
                <h2>{prediction.eventName}</h2>
                <div className="prediction-card__pick">
                  <span><FiTarget aria-hidden="true" /> PICK</span>
                  <strong>{prediction.pick}</strong>
                  {prediction.bookmaker ? <small>En {prediction.bookmaker}</small> : null}
                  {prediction.odds ? <em><FiTrendingUp aria-hidden="true" /> Cuota {prediction.odds}</em> : null}
                </div>
                {prediction.ticketImageUrl ? (
                  <a className="prediction-card__ticket" href={prediction.ticketImageUrl} target="_blank" rel="noopener noreferrer">
                    <span className="prediction-card__ticket-image">
                      <Image src={prediction.ticketImageUrl} alt={`Captura del ticket para ${prediction.eventName}`} fill sizes="(max-width: 719px) 100vw, 28rem" />
                    </span>
                    <span>Ver captura completa <FiExternalLink aria-hidden="true" /></span>
                  </a>
                ) : null}
                {prediction.analysis ? (
                  <div className="prediction-card__analysis">
                    <span>ANÁLISIS</span>
                    <p>{prediction.analysis}</p>
                  </div>
                ) : null}
                <footer>
                  <span><FiCalendar aria-hidden="true" /> {startDate.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  {prediction.betLink ? <a href={prediction.betLink} target="_blank" rel="noopener noreferrer">Ir a colocar apuesta <FiExternalLink aria-hidden="true" /></a> : null}
                </footer>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FiArrowLeft, FiCheck, FiCopy, FiLogOut, FiShield, FiX } from "react-icons/fi";
import QRCode from "qrcode";
import { plans } from "../../lib/plans.js";

const DEMO_NETWORK = "SMARTBETTING DEMO TESTNET";

export function PlanSelector() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingPlan, setSavingPlan] = useState("");
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await response.json();

        if (response.status === 401) {
          router.replace("/?registro=1");
          return;
        }

        if (!response.ok) {
          throw new Error(data.error || "No pudimos cargar tu cuenta.");
        }

        if (active) setUser(data.user);
      } catch (error) {
        if (active) setLoadError(error.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadSession();
    return () => {
      active = false;
    };
  }, [router]);

  const demoWallet = useMemo(() => {
    if (!checkoutPlan || !user) return "";
    return `DEMO-NO-ENVIAR-${checkoutPlan.id.toUpperCase()}-${user.username.toUpperCase()}`;
  }, [checkoutPlan, user]);

  useEffect(() => {
    if (!checkoutPlan || !demoWallet) {
      return;
    }

    let active = true;
    const payload = new URLSearchParams({
      environment: "DEMO_ONLY",
      network: DEMO_NETWORK,
      wallet: demoWallet,
      amount: checkoutPlan.amount,
      currency: checkoutPlan.currency,
      plan: checkoutPlan.name,
    });

    QRCode.toDataURL(`smartbetting-demo://checkout?${payload.toString()}`, {
      width: 420,
      margin: 2,
      color: { dark: "#071003", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then((dataUrl) => {
      if (active) setQrCode(dataUrl);
    });

    return () => {
      active = false;
    };
  }, [checkoutPlan, demoWallet]);

  const choosePlan = async (plan) => {
    setSavingPlan(plan.id);
    setCheckoutError("");

    try {
      const response = await fetch("/api/account/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await response.json();

      if (response.status === 401) {
        router.replace("/?registro=1");
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "No pudimos guardar el plan.");
      }

      setUser((current) => ({ ...current, selectedPlan: plan.id }));
      setQrCode("");
      setCheckoutPlan(plan);
    } catch (error) {
      setCheckoutError(error.message);
    } finally {
      setSavingPlan("");
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/");
  };

  const copyWallet = async () => {
    try {
      await navigator.clipboard.writeText(demoWallet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  if (loading) {
    return (
      <main className="plans-page plans-page--status">
        <span className="plans-page__loader" aria-hidden="true" />
        <p>Cargando tu cuenta…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="plans-page plans-page--status">
        <p className="plans-page__status-label">NO PUDIMOS ABRIR TU CUENTA</p>
        <h1>Falta conectar la base de datos</h1>
        <p>{loadError}</p>
        <Link className="plans-page__home-link" href="/">Volver al inicio</Link>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="plans-page">
      <header className="plans-page__header">
        <Link className="plans-page__back" href="/">
          <FiArrowLeft aria-hidden="true" />
          Inicio
        </Link>
        <div className="plans-page__brand">SMART<span>BETTING</span></div>
        <button className="plans-page__logout" type="button" onClick={logout}>
          <span>@{user.username}</span>
          <FiLogOut aria-label="Cerrar sesión" />
        </button>
      </header>

      <section className="plans-page__content">
        <p className="plans-page__eyebrow">CONFIGURA TU ACCESO</p>
        <h1>Elige el plan que moverá tu estrategia.</h1>
        <p className="plans-page__intro">
          Tu selección se guardará en la cuenta. En esta etapa, el checkout es una demostración y no procesa pagos.
        </p>

        {checkoutError ? <p className="plans-page__error" role="alert">{checkoutError}</p> : null}

        <div className="plans-page__grid">
          {plans.map((plan) => {
            const selected = user.selectedPlan === plan.id;
            return (
              <article
                className={`plan-option${plan.featured ? " plan-option--featured" : ""}${selected ? " is-selected" : ""}`}
                key={plan.id}
              >
                {plan.featured ? <span className="plan-option__badge">Más elegido</span> : null}
                {selected ? <span className="plan-option__selected"><FiCheck /> Seleccionado</span> : null}
                <p className="plan-option__eyebrow">{plan.eyebrow}</p>
                <h2>{plan.name}</h2>
                <p className="plan-option__price">
                  <strong>{plan.price}</strong>
                  <span>{plan.suffix}</span>
                </p>
                <p className="plan-option__description">{plan.description}</p>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}><FiCheck aria-hidden="true" /> {feature}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => choosePlan(plan)}
                  disabled={savingPlan === plan.id}
                >
                  {savingPlan === plan.id ? "Preparando…" : selected ? "Ver checkout demo" : "Elegir este plan"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {checkoutPlan ? (
        <div className="checkout-modal" role="presentation" onMouseDown={() => setCheckoutPlan(null)}>
          <section
            className="checkout-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="checkout-modal__close" type="button" onClick={() => setCheckoutPlan(null)} aria-label="Cerrar">
              <FiX aria-hidden="true" />
            </button>
            <div className="checkout-modal__warning">
              <FiShield aria-hidden="true" />
              <span><strong>Checkout de demostración.</strong> No envíes fondos: esta red y esta billetera no existen.</span>
            </div>
            <div className="checkout-modal__heading">
              <div>
                <p>SMARTBETTING PAY · DEMO</p>
                <h2 id="checkout-title">Plan {checkoutPlan.name}</h2>
              </div>
              <span className="checkout-modal__status">PENDIENTE · DEMO</span>
            </div>

            <div className="checkout-modal__body">
              <div className="checkout-modal__qr">
                {qrCode ? (
                  <Image src={qrCode} alt="QR ficticio del checkout de demostración" width={210} height={210} unoptimized />
                ) : (
                  <span>Cargando QR…</span>
                )}
                <small>QR NO PAGABLE</small>
              </div>
              <dl className="checkout-modal__details">
                <div>
                  <dt>Monto</dt>
                  <dd className="checkout-modal__amount">{checkoutPlan.amount} {checkoutPlan.currency}</dd>
                </div>
                <div>
                  <dt>Modalidad</dt>
                  <dd>{checkoutPlan.billing}</dd>
                </div>
                <div>
                  <dt>Red ficticia</dt>
                  <dd>{DEMO_NETWORK}</dd>
                </div>
                <div>
                  <dt>Billetera ficticia</dt>
                  <dd className="checkout-modal__wallet">
                    <code>{demoWallet}</code>
                    <button type="button" onClick={copyWallet} aria-label="Copiar billetera ficticia">
                      <FiCopy aria-hidden="true" /> {copied ? "Copiada" : "Copiar"}
                    </button>
                  </dd>
                </div>
              </dl>
            </div>
            <p className="checkout-modal__description">{checkoutPlan.description}</p>
            <button className="checkout-modal__done" type="button" onClick={() => setCheckoutPlan(null)}>
              Entendido, esto es una demostración
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

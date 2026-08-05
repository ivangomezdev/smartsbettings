"use client";

import { useState } from "react";
import Link from "next/link";
import { FiActivity, FiArrowUpRight, FiCheckCircle, FiClock, FiCreditCard, FiLock, FiMail, FiUser } from "react-icons/fi";
import { getPlanById } from "../../lib/plans.js";
import { useUserAccount } from "../UserShell/UserShell.jsx";

export function UserDashboard() {
  const { user, setUser } = useUserAccount();
  const [profile, setProfile] = useState({
    displayName: user.displayName || "",
    username: user.username,
    email: user.email || "",
  });
  const [profileStatus, setProfileStatus] = useState({ type: "", message: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordStatus, setPasswordStatus] = useState({ type: "", message: "" });
  const [savingPassword, setSavingPassword] = useState(false);

  const plan = getPlanById(user.selectedPlan);
  const expiresAt = user.planExpiresAt ? new Date(user.planExpiresAt) : null;
  const planActive = user.planStatus === "active" && (!expiresAt || expiresAt > new Date());
  const planExpired = user.planStatus === "active" && expiresAt && expiresAt <= new Date();
  const displayStatus = planActive
    ? "Activo"
    : planExpired
      ? "Vencido"
      : user.planStatus === "pending"
        ? "Pago pendiente"
        : "Sin plan activo";

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileStatus({ type: "", message: "" });

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos guardar el perfil.");
      setUser(data.user);
      setProfileStatus({ type: "success", message: "Datos actualizados correctamente." });
    } catch (error) {
      setProfileStatus({ type: "error", message: error.message });
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setPasswordStatus({ type: "", message: "" });
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordStatus({ type: "error", message: "Las contraseñas nuevas no coinciden." });
      return;
    }

    setSavingPassword(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos cambiar la contraseña.");
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordStatus({ type: "success", message: "Contraseña actualizada. Las otras sesiones se cerraron." });
    } catch (error) {
      setPasswordStatus({ type: "error", message: error.message });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <main className="user-dashboard">
      <header className="user-dashboard__hero">
        <div>
          <p>ÁREA PRIVADA</p>
          <h1>Hola, {user.displayName || user.username}.</h1>
          <span>Administra tu cuenta y revisa el estado de tu acceso.</span>
        </div>
        <Link href="/predictions">Ver predicciones <FiArrowUpRight aria-hidden="true" /></Link>
      </header>

      <section className="user-dashboard__stats" aria-label="Resumen de la cuenta">
        <article>
          <span className="user-dashboard__stat-icon"><FiCreditCard aria-hidden="true" /></span>
          <div><small>PLAN ACTUAL</small><strong>{plan?.name || "Sin seleccionar"}</strong></div>
        </article>
        <article>
          <span className={`user-dashboard__stat-icon${planActive ? " is-active" : ""}`}>
            {planActive ? <FiCheckCircle aria-hidden="true" /> : <FiClock aria-hidden="true" />}
          </span>
          <div><small>ESTADO</small><strong>{displayStatus}</strong></div>
        </article>
        <article>
          <span className="user-dashboard__stat-icon"><FiActivity aria-hidden="true" /></span>
          <div><small>PREDICCIONES</small><strong>{planActive && plan?.includesPredictions ? "Incluidas" : "Sin acceso"}</strong></div>
        </article>
      </section>

      <section className="user-dashboard__plan">
        <div>
          <p>MEMBRESÍA</p>
          <h2>{plan ? `Plan ${plan.name}` : "Elige un plan para comenzar"}</h2>
          <span>
            {planActive && expiresAt
              ? `Tu acceso está activo hasta el ${expiresAt.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}.`
              : "Activa un plan para acceder al contenido incluido."}
          </span>
        </div>
        <Link href="/planes">{plan ? "Administrar plan" : "Ver planes"} <FiArrowUpRight aria-hidden="true" /></Link>
      </section>

      <div className="user-dashboard__forms">
        <section className="account-panel">
          <div className="account-panel__heading">
            <span><FiUser aria-hidden="true" /></span>
            <div><h2>Información personal</h2><p>Actualiza los datos visibles de tu cuenta.</p></div>
          </div>
          <form onSubmit={saveProfile}>
            <label>
              Nombre
              <div className="account-field"><FiUser aria-hidden="true" /><input type="text" minLength={2} maxLength={80} value={profile.displayName} placeholder="Tu nombre" onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))} /></div>
            </label>
            <label>
              Usuario
              <div className="account-field"><span>@</span><input type="text" minLength={3} maxLength={30} required value={profile.username} onChange={(event) => setProfile((current) => ({ ...current, username: event.target.value }))} /></div>
            </label>
            <label>
              Correo electrónico
              <div className="account-field"><FiMail aria-hidden="true" /><input type="email" maxLength={254} value={profile.email} placeholder="nombre@correo.com" onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} /></div>
            </label>
            {profileStatus.message ? <p className={`account-message account-message--${profileStatus.type}`} role="status">{profileStatus.message}</p> : null}
            <button type="submit" disabled={savingProfile}>{savingProfile ? "Guardando…" : "Guardar cambios"}</button>
          </form>
        </section>

        <section className="account-panel">
          <div className="account-panel__heading">
            <span><FiLock aria-hidden="true" /></span>
            <div><h2>Seguridad</h2><p>Cambia la contraseña de acceso.</p></div>
          </div>
          <form onSubmit={savePassword}>
            <label>
              Contraseña actual
              <div className="account-field"><FiLock aria-hidden="true" /><input type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))} /></div>
            </label>
            <label>
              Nueva contraseña
              <div className="account-field"><FiLock aria-hidden="true" /><input type="password" minLength={8} maxLength={72} autoComplete="new-password" required value={passwords.newPassword} onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))} /></div>
            </label>
            <label>
              Confirmar contraseña
              <div className="account-field"><FiLock aria-hidden="true" /><input type="password" minLength={8} maxLength={72} autoComplete="new-password" required value={passwords.confirmPassword} onChange={(event) => setPasswords((current) => ({ ...current, confirmPassword: event.target.value }))} /></div>
            </label>
            {passwordStatus.message ? <p className={`account-message account-message--${passwordStatus.type}`} role="status">{passwordStatus.message}</p> : null}
            <button type="submit" disabled={savingPassword}>{savingPassword ? "Actualizando…" : "Cambiar contraseña"}</button>
          </form>
        </section>
      </div>
    </main>
  );
}

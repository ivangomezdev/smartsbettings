"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FiActivity, FiCompass, FiCreditCard, FiHome, FiLogOut, FiUser } from "react-icons/fi";
import { shouldSkipImageOptimization } from "../../lib/image.js";

const UserAccountContext = createContext(null);

const navigation = [
  { href: "/user", label: "Mi dashboard", icon: FiHome },
  { href: "/primeros-pasos", label: "Primeros pasos", icon: FiCompass },
  { href: "/predictions", label: "Predicciones", icon: FiActivity },
  { href: "/planes", label: "Planes", icon: FiCreditCard },
];

export function useUserAccount() {
  const context = useContext(UserAccountContext);
  if (!context) throw new Error("useUserAccount debe usarse dentro de UserShell.");
  return context;
}

export function UserShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const menuButtonRef = useRef(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await response.json();
        if (response.status === 401) {
          router.replace(`/?registro=1&returnTo=${encodeURIComponent(pathname)}`);
          return;
        }
        if (!response.ok) throw new Error(data.error || "No pudimos cargar tu cuenta.");
        if (active) setUser(data.user);
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadUser();
    return () => {
      active = false;
    };
  }, [pathname, router]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/");
  };

  if (loading) {
    return (
      <main className="user-shell-status">
        <span className="user-shell-status__loader" aria-hidden="true" />
        <p>Preparando tu dashboard…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="user-shell-status">
        <p className="user-shell-status__eyebrow">CUENTA NO DISPONIBLE</p>
        <h1>No pudimos abrir tu dashboard</h1>
        <p>{error}</p>
        <Link href="/">Volver al inicio</Link>
      </main>
    );
  }

  if (!user) return null;

  const initials = (user.displayName || user.username).slice(0, 2).toUpperCase();

  return (
    <UserAccountContext.Provider value={{ user, setUser }}>
      <div className="user-shell">
        <header className="user-shell__mobile-header">
          <Link className="user-shell__mobile-brand" href="/user" aria-label="SmartBetting dashboard">
            <span className="user-shell__mobile-logo">
              <Image
                src="/smartbettting-logotrans.png"
                alt=""
                width={100}
                height={100}
                priority
                unoptimized={shouldSkipImageOptimization}
              />
            </span>
            <span>SMART<strong>BETTING</strong></span>
          </Link>
          <button
            className="user-shell__mobile-toggle"
            type="button"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileOpen}
            aria-controls="user-mobile-nav"
            onClick={() => setMobileOpen((open) => !open)}
            ref={menuButtonRef}
          >
            <Image
              src={mobileOpen ? "/close.png" : "/open.png"}
              alt=""
              fill
              sizes="3rem"
              unoptimized={shouldSkipImageOptimization}
            />
          </button>
          {mobileOpen ? (
            <nav className="user-shell__mobile-menu" id="user-mobile-nav" aria-label="Navegación de usuario">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link className={active ? "is-active" : ""} href={item.href} key={item.href} onClick={() => setMobileOpen(false)}>
                    <Icon aria-hidden="true" /> {item.label}
                  </Link>
                );
              })}
              <button type="button" onClick={logout}><FiLogOut aria-hidden="true" /> Cerrar sesión</button>
            </nav>
          ) : null}
        </header>

        <aside className="user-shell__sidebar">
          <Link className="user-shell__brand" href="/user">
            SMART<span>BETTING</span>
          </Link>
          <div className="user-shell__profile">
            <span className="user-shell__avatar">{initials}</span>
            <div>
              <strong>{user.displayName || user.username}</strong>
              <span>@{user.username}</span>
            </div>
          </div>
          <nav className="user-shell__nav" aria-label="Navegación de usuario">
            <p>CUENTA</p>
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link className={active ? "is-active" : ""} href={item.href} key={item.href}>
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="user-shell__sidebar-footer">
            <Link href="/" className="user-shell__landing-link"><FiUser aria-hidden="true" /> Ver sitio público</Link>
            <button type="button" onClick={logout}><FiLogOut aria-hidden="true" /> Cerrar sesión</button>
          </div>
        </aside>

        <div className="user-shell__main">{children}</div>
      </div>
    </UserAccountContext.Provider>
  );
}

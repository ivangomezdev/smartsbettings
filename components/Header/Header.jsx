"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { shouldSkipImageOptimization } from "../../lib/image.js";
import { Button } from "../Button/Button.jsx";

const navItems = [
  { label: "Plataforma", href: "#plataforma" },
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "Precios", href: "#precios" },
  { label: "Reseñas", href: "#resenas" },
  { label: "FAQ", href: "#faq" },
];

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    const desktopMediaQuery = window.matchMedia("(min-width: 768px)");
    const closeMenuOnDesktop = (event) => {
      if (event.matches) {
        setIsMenuOpen(false);
      }
    };

    desktopMediaQuery.addEventListener("change", closeMenuOnDesktop);
    return () =>
      desktopMediaQuery.removeEventListener("change", closeMenuOnDesktop);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }

    const closeMenuWithEscape = (event) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    window.addEventListener("keydown", closeMenuWithEscape);
    return () => window.removeEventListener("keydown", closeMenuWithEscape);
  }, [isMenuOpen]);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="header">
      <div className="header__inner u-container">
        <a className="header__brand" href="#inicio" aria-label="SmartBetting inicio">
          <span className="header__logo-frame">
            <Image
              className="header__logo"
              src="/smartbettting-logotrans.png"
              alt=""
              width={240}
              height={240}
              priority
              unoptimized={shouldSkipImageOptimization}
            />
          </span>
          <span className="header__wordmark">
            SMART<span className="header__wordmark-accent">BETTING</span>
          </span>
        </a>
        <nav className="header__nav" aria-label="Navegación principal">
          {navItems.map((item) => (
            <a className="header__link" href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="header__action">
          <Button href="#precios" variant="primary">
            Ver planes
          </Button>
        </div>
        <button
          className={`header__menu-toggle${isMenuOpen ? " header__menu-toggle--open" : ""}`}
          type="button"
          aria-controls="mobile-navigation"
          aria-expanded={isMenuOpen}
          aria-label={
            isMenuOpen
              ? "Cerrar menú de navegación"
              : "Abrir menú de navegación"
          }
          onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
          ref={menuButtonRef}
        >
          <span className="header__menu-icon" aria-hidden="true">
            <Image
              src={isMenuOpen ? "/close.png" : "/open.png"}
              alt=""
              fill
              sizes="3rem"
              unoptimized={shouldSkipImageOptimization}
            />
          </span>
        </button>
      </div>
      {isMenuOpen && (
        <div className="header__mobile-panel" id="mobile-navigation">
          <nav
            className="header__mobile-nav u-container"
            aria-label="Navegación móvil"
          >
            {navItems.map((item) => (
              <a
                className="header__mobile-link"
                href={item.href}
                key={item.href}
                onClick={closeMenu}
              >
                {item.label}
              </a>
            ))}
            <div className="header__mobile-action">
              <Button href="#precios" variant="primary" onClick={closeMenu}>
                Ver planes
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

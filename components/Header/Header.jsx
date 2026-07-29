import Image from "next/image";
import { Button } from "../Button/Button.jsx";

const navItems = [
  { label: "Plataforma", href: "#plataforma" },
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "Precios", href: "#precios" },
  { label: "Reseñas", href: "#resenas" },
  { label: "FAQ", href: "#faq" },
];

export function Header() {
  return (
    <header className="header">
      <div className="header__inner u-container">
        <a className="header__brand" href="#inicio" aria-label="SmartBetting inicio">
          <span className="header__logo-frame">
            <Image
              className="header__logo"
              src="/smartbetting-logo.jpeg"
              alt=""
              width={240}
              height={240}
              priority
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
      </div>
    </header>
  );
}

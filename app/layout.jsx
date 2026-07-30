import { Inter, Rajdhani } from "next/font/google";
import { headers } from "next/headers";
import "../styles/globals.css";

const headingFont = Rajdhani({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
});

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`;

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: "SmartBetting | Predicciones deportivas y arbitraje",
      template: "%s | SmartBetting",
    },
    description:
      "Oportunidades de arbitraje deportivo y predicciones verificadas, explicadas con datos claros y una experiencia simple.",
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title: "SmartBetting | Decisiones deportivas con ventaja",
      description:
        "Arbitrajes desde 30 USDT al mes y predicciones a 70 USDT por ganadora.",
      url: "/",
      siteName: "SmartBetting",
      locale: "es_MX",
      type: "website",
      images: [
        {
          url: "/og-luxury.png",
          width: 1734,
          height: 907,
          alt: "SmartBetting — Tu ventaja no es suerte. Son datos.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "SmartBetting | Decisiones deportivas con ventaja",
      description:
        "Oportunidades claras, alertas oportunas y control de riesgo.",
      images: ["/og-luxury.png"],
    },
    icons: {
      icon: "/smartbettting-logotrans.png",
      shortcut: "/smartbettting-logotrans.png",
    },
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={`${headingFont.variable} ${bodyFont.variable}`}>
        {children}
      </body>
    </html>
  );
}

import { Suspense } from "react";
import { PredictionsHub } from "../../../components/PredictionsHub/PredictionsHub.jsx";

export const metadata = {
  title: "Predicciones",
  description: "Chat de análisis y picks disponibles para tu plan de SmartBetting.",
  robots: { index: false, follow: false },
};

export default function PredictionsPage() {
  return <Suspense fallback={<main className="predictions-hub"><p>Cargando Predictions…</p></main>}><PredictionsHub /></Suspense>;
}

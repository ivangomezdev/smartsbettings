import { PredictionsFeed } from "../../../components/PredictionsFeed/PredictionsFeed.jsx";

export const metadata = {
  title: "Predicciones",
  description: "Picks disponibles para tu plan de SmartBetting.",
  robots: { index: false, follow: false },
};

export default function PredictionsPage() {
  return <PredictionsFeed />;
}

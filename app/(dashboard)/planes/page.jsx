import { PlanSelector } from "../../../components/PlanSelector/PlanSelector.jsx";

export const metadata = {
  title: "Elige tu plan",
  description: "Selecciona el plan de SmartBetting que usarás en tu cuenta.",
  robots: { index: false, follow: false },
};

export default function PlansPage() {
  return <PlanSelector />;
}

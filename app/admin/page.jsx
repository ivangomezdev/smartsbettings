import { AdminPanel } from "../../components/AdminPanel/AdminPanel.jsx";

export const metadata = {
  title: "Administración de picks",
  description: "Panel privado para publicar picks de SmartBetting.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return <AdminPanel />;
}

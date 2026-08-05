import { UserDashboard } from "../../../components/UserDashboard/UserDashboard.jsx";

export const metadata = {
  title: "Mi dashboard",
  description: "Administra tu cuenta y plan de SmartBetting.",
  robots: { index: false, follow: false },
};

export default function UserPage() {
  return <UserDashboard />;
}

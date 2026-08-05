import { UserShell } from "../../components/UserShell/UserShell.jsx";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }) {
  return <UserShell>{children}</UserShell>;
}

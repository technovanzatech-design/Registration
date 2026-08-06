import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getAdminSession, type AdminSession } from "@/lib/admin-auth";
import { AdminShell } from "@/routes/admin/AdminShell";

export const Route = createFileRoute("/admin/_authenticated")({
  ssr: false,
  // Every route nested under this layout runs this check first. If it's
  // not satisfied, the user never sees the child route render at all.
  beforeLoad: async (): Promise<{ admin: AdminSession }> => {
    const session = await getAdminSession();
    if (!session) {
      throw redirect({ to: "/admin/login" });
    }
    return { admin: session };
  },
  component: AuthenticatedAdminLayout,
});

function AuthenticatedAdminLayout() {
  const { admin } = Route.useRouteContext();
  return (
    <AdminShell admin={admin}>
      <Outlet />
    </AdminShell>
  );
}
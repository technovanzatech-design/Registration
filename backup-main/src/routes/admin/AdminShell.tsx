import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarClock, LogOut, Users, CalendarDays } from "lucide-react";
import type { ReactNode } from "react";

import { signOutAdmin, type AdminSession } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Only routes that exist today are real links. The rest are wired up as
// their route files land in later phases (Events, Participants, Schedule) —
// listed here already so the nav layout doesn't shift later, but shown as
// disabled until then instead of pointing at routes that don't exist yet.
const NAV_ITEMS = [
  { to: "/admin" as const, label: "Overview", icon: LayoutDashboard, enabled: true },
  { to: "/admin/events" as const, label: "Events", icon: CalendarDays, enabled: true },
  { to: "/admin/participants" as const, label: "Participants", icon: Users, enabled: true },
  { to: "/admin/schedule" as const, label: "Schedule", icon: CalendarClock, enabled: true },
];

export function AdminShell({
  admin,
  children,
}: {
  admin: AdminSession;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const handleLogout = async () => {
    await signOutAdmin();
    navigate({ to: "/admin/login" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card/40 md:flex md:flex-col">
        <div className="px-5 py-6">
          <p className="font-display text-sm font-bold tracking-wide text-foreground">
            TECHNOVANZA
          </p>
          <p className="text-xs text-muted-foreground">Admin Dashboard</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            if (!item.to || !item.enabled) {
              return (
                <span
                  key={item.label}
                  className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/40"
                  title="Coming soon"
                >
                  <Icon className="size-4" />
                  {item.label}
                </span>
              );
            }

            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border px-3 py-4">
          <p className="truncate px-3 pb-2 text-xs text-muted-foreground">
            {admin.email}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleLogout}
          >
            <LogOut className="size-4" />
            Log out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
          <p className="font-display text-sm font-bold text-foreground">
            TECHNOVANZA Admin
          </p>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="size-4" />
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
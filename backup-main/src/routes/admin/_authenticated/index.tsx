import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/admin/_authenticated/")({
  head: () => ({
    meta: [{ title: "Admin Dashboard — TECHNOVANZA 2026" }],
  }),
  component: AdminOverviewPage,
});

type EventCapacityRow = {
  event_slug: string;
  event_name: string;
  capacity: number | null;
  registered_count: number;
  seats_remaining: number | null;
};

type RecentRegistration = {
  id: string;
  full_name: string;
  register_no: string;
  college_name: string;
  created_at: string;
};

function useAdminOverviewData() {
  const totalRegistrations = useQuery({
    queryKey: ["admin", "registrations", "count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("registrations")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const eventCapacity = useQuery({
    queryKey: ["admin", "event_capacity_status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_capacity_status")
        .select("*")
        .order("event_name");
      if (error) throw error;
      return (data ?? []) as EventCapacityRow[];
    },
  });

  const recentRegistrations = useQuery({
    queryKey: ["admin", "registrations", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, full_name, register_no, college_name, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as RecentRegistration[];
    },
  });

  return { totalRegistrations, eventCapacity, recentRegistrations };
}

function AdminOverviewPage() {
  const { admin } = Route.useRouteContext();
  const { totalRegistrations, eventCapacity, recentRegistrations } =
    useAdminOverviewData();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Welcome back
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {admin.email}
        </p>
      </div>

      {/* 1. Registration stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Total registrations</CardTitle>
        </CardHeader>
        <CardContent>
          {totalRegistrations.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : totalRegistrations.isError ? (
            <p className="text-sm text-destructive">
              Couldn't load registration count.
            </p>
          ) : (
            <p className="font-display text-4xl font-bold text-foreground">
              {totalRegistrations.data}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. Event capacity fill */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event capacity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {eventCapacity.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : eventCapacity.isError ? (
            <p className="text-sm text-destructive">
              Couldn't load event capacity data.
            </p>
          ) : eventCapacity.data && eventCapacity.data.length > 0 ? (
            eventCapacity.data.map((row) => {
              const pct =
                row.capacity && row.capacity > 0
                  ? Math.min((row.registered_count / row.capacity) * 100, 100)
                  : null;
              return (
                <div key={row.event_slug} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">
                      {row.event_name}
                    </span>
                    <span className="text-muted-foreground">
                      {row.registered_count}
                      {row.capacity != null ? ` / ${row.capacity}` : ""}
                    </span>
                  </div>
                  {pct != null && <Progress value={pct} />}
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          )}
        </CardContent>
      </Card>

      {/* 3. Recent registrations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent registrations</CardTitle>
        </CardHeader>
        <CardContent>
          {recentRegistrations.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : recentRegistrations.isError ? (
            <p className="text-sm text-destructive">
              Couldn't load recent registrations.
            </p>
          ) : recentRegistrations.data && recentRegistrations.data.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border">
              {recentRegistrations.data.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="text-foreground">{r.full_name}</span>
                  <span className="text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No registrations yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
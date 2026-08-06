import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, Pencil } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/_authenticated/events")({
  head: () => ({ meta: [{ title: "Events — TECHNOVANZA 2026 Admin" }] }),
  component: EventsPage,
});

type EventRow = {
  event_slug: string;
  event_name: string;
  capacity: number | null;
  registered_count: number;
  seats_remaining: number | null;
  team_size?: number;
};

function EventsPage() {
  const queryClient = useQueryClient();
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draftCapacity, setDraftCapacity] = useState<string>("");
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "event_capacity_status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_capacity_status")
        .select("*")
        .order("event_name");
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const startEdit = (row: EventRow) => {
    setEditingSlug(row.event_slug);
    setDraftCapacity(row.capacity == null ? "" : String(row.capacity));
  };

  const cancelEdit = () => {
    setEditingSlug(null);
    setDraftCapacity("");
  };

  const saveCapacity = async (slug: string) => {
    // Empty input = unlimited (null). Otherwise must be a non-negative integer.
    const trimmed = draftCapacity.trim();
    const newCapacity = trimmed === "" ? null : Number(trimmed);

    if (newCapacity !== null && (!Number.isInteger(newCapacity) || newCapacity < 0)) {
      toast.error("Capacity must be a whole number, 0 or greater.");
      return;
    }

    setSavingSlug(slug);
    const { error } = await supabase
      .from("events")
      .update({ capacity: newCapacity })
      .eq("slug", slug);
    setSavingSlug(null);

    if (error) {
      toast.error(`Couldn't save: ${error.message}`);
      return;
    }

    toast.success("Capacity updated.");
    setEditingSlug(null);
    queryClient.invalidateQueries({ queryKey: ["admin", "event_capacity_status"] });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Events</h1>
        <p className="text-sm text-muted-foreground">
          Edit registration limits — changes apply immediately.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All events</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-destructive">Couldn't load events.</p>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events found.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {data.map((row) => {
                const isFull = row.capacity != null && row.registered_count >= row.capacity;
                const isEditing = editingSlug === row.event_slug;
                const isSaving = savingSlug === row.event_slug;

                return (
                  <div
                    key={row.event_slug}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-[180px]">
                      <p className="font-medium text-foreground">{row.event_name}</p>
                      <p className="text-xs text-muted-foreground">{row.event_slug}</p>
                    </div>

                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-muted-foreground">
                        {row.team_size === 2 ? "Participants / teams:" : "Participants:"}{" "}
                        <span className="font-medium text-foreground">
                          {row.team_size === 2
                            ? `${row.registered_count} / ${Math.floor(row.registered_count / 2)}`
                            : row.registered_count}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-muted-foreground">
                        Limit:
                        {isEditing ? (
                          <>
                            <Input
                              value={draftCapacity}
                              onChange={(e) => setDraftCapacity(e.target.value)}
                              placeholder="Unlimited"
                              className="h-8 w-24"
                              inputMode="numeric"
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              disabled={isSaving}
                              onClick={() => saveCapacity(row.event_slug)}
                            >
                              {isSaving ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Check className="size-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              onClick={cancelEdit}
                              disabled={isSaving}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-foreground">
                              {row.capacity ?? "Unlimited"}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              onClick={() => startEdit(row)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>

                      <Badge variant={isFull ? "destructive" : "secondary"}>
                        {isFull ? "FULL" : "OPEN"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

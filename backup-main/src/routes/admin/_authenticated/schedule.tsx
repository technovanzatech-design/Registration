import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/_authenticated/schedule")({
  head: () => ({ meta: [{ title: "Schedule — TECHNOVANZA 2026 Admin" }] }),
  component: SchedulePage,
});

type ScheduleRow = {
  id: string;
  registration_id: string;
  full_name: string;
  register_no: string;
  event_slug: string;
  event_name: string;
  schedule_date: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "completed" | "cancelled";
  created_at: string;
};

type RegistrationOption = { id: string; full_name: string; register_no: string; events: string[] };
type EventOption = { slug: string; name: string };

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}

function SchedulePage() {
  const queryClient = useQueryClient();

  const [participantSearch, setParticipantSearch] = useState("");
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string>("");
  const [selectedEventSlug, setSelectedEventSlug] = useState<string>("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const schedulesQuery = useQuery({
    queryKey: ["admin", "schedule_details"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_details")
        .select("*")
        .order("schedule_date")
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as ScheduleRow[];
    },
  });

  const registrationsQuery = useQuery({
    queryKey: ["admin", "registrations", "for-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, full_name, register_no, events")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as RegistrationOption[];
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["admin", "events", "for-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("slug, name").order("name");
      if (error) throw error;
      return (data ?? []) as EventOption[];
    },
  });

  const filteredParticipants = useMemo(() => {
    const term = participantSearch.trim().toLowerCase();
    const all = registrationsQuery.data ?? [];
    if (!term) return all.slice(0, 20);
    return all
      .filter(
        (r) =>
          r.full_name.toLowerCase().includes(term) ||
          r.register_no.toLowerCase().includes(term),
      )
      .slice(0, 20);
  }, [participantSearch, registrationsQuery.data]);

  const selectedRegistration = registrationsQuery.data?.find(
    (r) => r.id === selectedRegistrationId,
  );

  // Only let the admin pick an event the participant actually registered
  // for — avoids scheduling someone for an event they never signed up to.
  const eventOptionsForParticipant = useMemo(() => {
    if (!selectedRegistration) return [];
    const all = eventsQuery.data ?? [];
    return all.filter((e) => selectedRegistration.events.includes(e.slug));
  }, [selectedRegistration, eventsQuery.data]);

  // Conflicts across ALL existing schedules, grouped by participant, so
  // rows in the table can show a warning badge.
  const conflictsByScheduleId = useMemo(() => {
    const conflicts = new Set<string>();
    const rows = schedulesQuery.data ?? [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        if (
          a.registration_id === b.registration_id &&
          a.schedule_date === b.schedule_date &&
          timesOverlap(a.start_time, a.end_time, b.start_time, b.end_time)
        ) {
          conflicts.add(a.id);
          conflicts.add(b.id);
        }
      }
    }
    return conflicts;
  }, [schedulesQuery.data]);

  const resetForm = () => {
    setSelectedRegistrationId("");
    setSelectedEventSlug("");
    setDate("");
    setStartTime("");
    setEndTime("");
    setParticipantSearch("");
  };

  const submitSchedule = async () => {
    if (!selectedRegistrationId || !selectedEventSlug || !date || !startTime || !endTime) {
      toast.error("Fill in every field before assigning a schedule.");
      return;
    }
    if (startTime >= endTime) {
      toast.error("End time must be after start time.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("schedules").insert({
      registration_id: selectedRegistrationId,
      event_slug: selectedEventSlug,
      schedule_date: date,
      start_time: startTime,
      end_time: endTime,
    });
    setSubmitting(false);

    if (error) {
      toast.error(`Couldn't save schedule: ${error.message}`);
      return;
    }

    toast.success("Schedule assigned.");
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["admin", "schedule_details"] });
  };

  const deleteSchedule = async (id: string) => {
    const { error } = await supabase.from("schedules").delete().eq("id", id);
    if (error) {
      toast.error(`Couldn't delete: ${error.message}`);
      return;
    }
    toast.success("Schedule removed.");
    queryClient.invalidateQueries({ queryKey: ["admin", "schedule_details"] });
  };

  const updateStatus = async (id: string, status: ScheduleRow["status"]) => {
    const { error } = await supabase.from("schedules").update({ status }).eq("id", id);
    if (error) {
      toast.error(`Couldn't update status: ${error.message}`);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin", "schedule_details"] });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Assign participants to events at specific times. Overlaps are flagged automatically.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assign a schedule</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground">Participant</label>
              <Input
                placeholder="Search by name or register no…"
                value={participantSearch}
                onChange={(e) => {
                  setParticipantSearch(e.target.value);
                  setSelectedRegistrationId("");
                  setSelectedEventSlug("");
                }}
              />
              {participantSearch && !selectedRegistrationId && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                  {filteredParticipants.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">No matches.</p>
                  ) : (
                    filteredParticipants.map((r) => (
                      <button
                        key={r.id}
                        className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setSelectedRegistrationId(r.id);
                          setParticipantSearch(r.full_name);
                          setSelectedEventSlug("");
                        }}
                      >
                        <span className="text-foreground">{r.full_name}</span>
                        <span className="text-xs text-muted-foreground">{r.register_no}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground">Event</label>
              <Select
                value={selectedEventSlug}
                onValueChange={setSelectedEventSlug}
                disabled={!selectedRegistrationId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      selectedRegistrationId ? "Select event" : "Pick a participant first"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {eventOptionsForParticipant.map((e) => (
                    <SelectItem key={e.slug} value={e.slug}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="flex gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <label className="text-sm text-muted-foreground">Start time</label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <label className="text-sm text-muted-foreground">End time</label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          <Button onClick={submitSchedule} disabled={submitting} className="w-fit">
            {submitting && <Loader2 className="animate-spin" />}
            Assign schedule
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All schedules</CardTitle>
        </CardHeader>
        <CardContent>
          {schedulesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : schedulesQuery.isError ? (
            <p className="text-sm text-destructive">Couldn't load schedules.</p>
          ) : !schedulesQuery.data || schedulesQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schedules yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Participant</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedulesQuery.data.map((s) => {
                    const hasConflict = conflictsByScheduleId.has(s.id);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{s.full_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {s.register_no}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{s.event_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(s.schedule_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <div className="flex items-center gap-2">
                            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                            {hasConflict && (
                              <span
                                className="flex items-center gap-1 text-xs text-destructive"
                                title="Overlaps with another schedule for this participant"
                              >
                                <AlertTriangle className="size-3.5" />
                                Conflict
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={s.status}
                            onValueChange={(v) =>
                              updateStatus(s.id, v as ScheduleRow["status"])
                            }
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="scheduled">Scheduled</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteSchedule(s.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
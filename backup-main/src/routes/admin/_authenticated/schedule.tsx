import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Loader2, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { createTwoSlotSchedule, type SchedulerEvent, type SchedulerRegistration, type SchedulerSlot } from "@/lib/twoSlotScheduler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/admin/_authenticated/schedule")({
  head: () => ({ meta: [{ title: "Schedule - TECHNOVANZA 2026 Admin" }] }),
  component: SchedulePage,
});

type TechTalkTeam = { team_key: string; member_one_register_no: string; member_two_register_no: string; member_one_name: string | null; member_two_name: string | null; approved: boolean };
type Assignment = { id: string; registration_id: string; participant_id: string; full_name: string; register_no: string; event_slug: string; event_name: string; slot_number: 1 | 2; schedule_date: string; start_time: string; end_time: string; room: string };

const time = (value: string) => new Date(`2000-01-01T${value}`).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

function SchedulePage() {
  const queryClient = useQueryClient();
  const registrations = useQuery({ queryKey: ["scheduler", "registrations"], queryFn: async () => { const { data, error } = await supabase.from("registrations").select("id, register_no, full_name, status, events, partner_register_no, event_partners"); if (error) throw error; return (data ?? []) as SchedulerRegistration[]; } });
  const events = useQuery({ queryKey: ["scheduler", "events"], queryFn: async () => { const { data, error } = await supabase.from("events").select("slug, category, team_size"); if (error) throw error; return (data ?? []) as SchedulerEvent[]; } });
  const slots = useQuery({ queryKey: ["scheduler", "slots"], queryFn: async () => { const { data, error } = await supabase.from("event_schedule_slots").select("id, event_slug, slot_number, participant_capacity").order("event_slug").order("slot_number"); if (error) throw error; return (data ?? []) as SchedulerSlot[]; } });
  const teams = useQuery({ queryKey: ["scheduler", "techtalks"], queryFn: async () => { const { data, error } = await supabase.rpc("techtalks_schedule_candidates"); if (error) throw error; return (data ?? []) as TechTalkTeam[]; } });
  const assignments = useQuery({ queryKey: ["scheduler", "assignments"], queryFn: async () => { const { data, error } = await supabase.from("schedule_assignment_details").select("*").order("slot_number").order("event_name").order("full_name"); if (error) throw error; return (data ?? []) as Assignment[]; } });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["scheduler"] });

  const setTeamApproval = async (team: TechTalkTeam, approved: boolean) => {
    const { error } = await supabase.rpc("set_techtalks_team_approval", { p_team_key: team.team_key, p_approved: approved });
    if (error) return toast.error(error.message);
    toast.success(approved ? "TechTalks team approved." : "TechTalks team removed from the approved list.");
    refresh();
  };
  const generate = async () => {
    if (!registrations.data || !events.data || !slots.data || !teams.data) return;
    try {
      const approved = new Set(teams.data.filter((team) => team.approved).map((team) => team.team_key));
      const result = createTwoSlotSchedule(registrations.data, events.data, slots.data, approved);
      const { error } = await supabase.rpc("replace_automatic_schedule", { p_assignments: result.assignments });
      if (error) throw error;
      toast.success(`Saved ${result.assignments.length} conflict-free schedule assignments.`);
      if (result.excludedTechTalkTeams.length) toast.info(`${result.excludedTechTalkTeams.length} unapproved TechTalks team(s) were left without a TechTalks slot.`);
      refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not generate the schedule."); }
  };
  const exportPdf = () => {
    if (!assignments.data?.length) return toast.error("Generate the schedule before exporting PDF.");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.setFillColor(40, 7, 7); pdf.rect(0, 0, 297, 210, "F"); pdf.setTextColor(255, 235, 235); pdf.setFontSize(20); pdf.text("TECHNOVANZA 2026 - Final Event Schedule", 15, 18);
    pdf.setFontSize(10); pdf.setTextColor(255, 170, 170); pdf.text("Generated from the conflict-checked admin scheduler", 15, 25);
    let y = 38;
    for (const slotNumber of [1, 2] as const) {
      const slotRows = assignments.data.filter((row) => row.slot_number === slotNumber);
      pdf.setTextColor(255, 100, 100); pdf.setFontSize(13); pdf.text(`SLOT ${slotNumber} - ${slotRows[0] ? `${time(slotRows[0].start_time)} to ${time(slotRows[0].end_time)}` : ""}`, 15, y); y += 7;
      pdf.setTextColor(255, 235, 235); pdf.setFontSize(8);
      for (const row of slotRows) {
        const line = `${row.event_name} | ${row.room} | ${row.full_name} (${row.register_no})`;
        if (y > 195) { pdf.addPage(); pdf.setFillColor(40, 7, 7); pdf.rect(0, 0, 297, 210, "F"); y = 18; }
        pdf.text(line.slice(0, 125), 18, y); y += 5;
      }
      y += 7;
    }
    pdf.save("TECHNOVANZA-2026-Final-Schedule.pdf");
  };

  const loading = registrations.isLoading || events.isLoading || slots.isLoading || teams.isLoading;
  return <div className="flex flex-col gap-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h1 className="font-display text-2xl font-bold text-foreground">Conflict-Free Schedule</h1><p className="text-sm text-muted-foreground">Approve 12 TechTalks teams, then create two non-overlapping event slots for every participant and teammate.</p></div><div className="flex gap-2"><Button variant="outline" onClick={refresh}><RefreshCw className="size-4" /> Refresh</Button><Button variant="outline" onClick={exportPdf}><FileDown className="size-4" /> Export PDF</Button><Button onClick={generate} disabled={loading}><ShieldCheck className="size-4" /> Generate schedule</Button></div></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="size-4 text-primary" /> TechTalks paper approvals</CardTitle><p className="text-sm text-muted-foreground">Approve a maximum of 12 teams. Only approved teams receive one of the 6 team places in Slot 1 or Slot 2. Their selected non-technical event is placed in the opposite slot.</p></CardHeader><CardContent>{teams.isLoading ? <p>Loading teams…</p> : <div className="grid gap-3 md:grid-cols-2">{teams.data?.map((team) => <div key={team.team_key} className="flex items-center justify-between rounded-xl border border-border p-3"><div><p className="font-medium">{team.member_one_name ?? team.member_one_register_no} + {team.member_two_name ?? team.member_two_register_no}</p><p className="text-xs text-muted-foreground">{team.member_one_register_no} · {team.member_two_register_no}</p></div><Button size="sm" variant={team.approved ? "default" : "outline"} onClick={() => setTeamApproval(team, !team.approved)}>{team.approved ? "Approved" : "Approve"}</Button></div>)}</div>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Generated assignments</CardTitle><p className="text-sm text-muted-foreground">Every row has been assigned using the participant’s selected event. A teammate-connected group is kept in the same technical slot, so their team event occurs in the opposite slot.</p></CardHeader><CardContent>{assignments.isLoading ? <p>Loading…</p> : !assignments.data?.length ? <p className="text-sm text-muted-foreground">No generated schedule yet. Approve the selected TechTalks teams and click Generate schedule.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Slot</TableHead><TableHead>Time</TableHead><TableHead>Event</TableHead><TableHead>Room</TableHead><TableHead>Participant</TableHead><TableHead>Register No.</TableHead></TableRow></TableHeader><TableBody>{assignments.data.map((row) => <TableRow key={row.id}><TableCell><Badge>{`Slot ${row.slot_number}`}</Badge></TableCell><TableCell>{time(row.start_time)} - {time(row.end_time)}</TableCell><TableCell>{row.event_name}</TableCell><TableCell>{row.room}</TableCell><TableCell className="font-medium">{row.full_name}</TableCell><TableCell>{row.register_no}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
  </div>;
}

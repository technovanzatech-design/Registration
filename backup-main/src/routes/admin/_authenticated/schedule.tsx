import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Loader2, Mail, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { sendScheduleEmail, type ScheduleEmailItem } from "@/lib/email";
import { getSchedulePassBlob } from "@/lib/scheduleCard";
import { uploadSchedulePass } from "@/lib/storage";
import { createTwoSlotSchedule, type SchedulerEvent, type SchedulerRegistration, type SchedulerSlot } from "@/lib/twoSlotScheduler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/admin/_authenticated/schedule")({
  head: () => ({ meta: [{ title: "Schedule - TECHNOVANZA 2026 Admin" }] }),
  component: SchedulePage,
});

type TechTalkTeam = { team_key: string; member_one_register_no: string; member_two_register_no: string; member_one_name: string | null; member_two_name: string | null; approved: boolean };
type Assignment = { id: string; registration_id: string; participant_id: string; full_name: string; register_no: string; event_slug: string; event_name: string; slot_number: 1 | 2; schedule_date: string; start_time: string; end_time: string; room: string };
type ScheduleDelivery = { id: string; registration_id: string | null; recipient_email: string; status: "sending" | "sent" | "failed"; error_message: string | null; created_at: string };

const time = (value: string) => new Date(`2000-01-01T${value}`).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

function SchedulePage() {
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [sendingSchedules, setSendingSchedules] = useState(false);
  const [sendingRegistrationId, setSendingRegistrationId] = useState<string | null>(null);
  const [selectedScheduleParticipant, setSelectedScheduleParticipant] = useState<SchedulerRegistration | null>(null);
  const registrations = useQuery({ queryKey: ["scheduler", "registrations"], queryFn: async () => { const { data, error } = await supabase.from("registrations").select("id, participant_id, register_no, full_name, email, status, events, partner_register_no, event_partners"); if (error) throw error; return (data ?? []) as SchedulerRegistration[]; } });
  const events = useQuery({ queryKey: ["scheduler", "events"], queryFn: async () => { const { data, error } = await supabase.from("events").select("slug, category, team_size"); if (error) throw error; return (data ?? []) as SchedulerEvent[]; } });
  const slots = useQuery({ queryKey: ["scheduler", "slots"], queryFn: async () => { const { data, error } = await supabase.from("event_schedule_slots").select("id, event_slug, slot_number, participant_capacity").order("event_slug").order("slot_number"); if (error) throw error; return (data ?? []) as SchedulerSlot[]; } });
  const teams = useQuery({ queryKey: ["scheduler", "techtalks"], queryFn: async () => { const { data, error } = await supabase.rpc("techtalks_schedule_candidates"); if (error) throw error; return (data ?? []) as TechTalkTeam[]; } });
  const assignments = useQuery({ queryKey: ["scheduler", "assignments"], queryFn: async () => { const { data, error } = await supabase.from("schedule_assignment_details").select("*").order("slot_number").order("event_name").order("full_name"); if (error) throw error; return (data ?? []) as Assignment[]; } });
  const scheduleDeliveries = useQuery({ queryKey: ["scheduler", "schedule-deliveries"], queryFn: async () => { const { data, error } = await supabase.from("email_delivery_log").select("id, registration_id, recipient_email, status, error_message, created_at").in("delivery_type", ["schedule", "schedule_resend"]).order("created_at", { ascending: false }); if (error) throw error; return (data ?? []) as ScheduleDelivery[]; } });
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
  const registrationByNumber = new Map((registrations.data ?? []).map((registration) => [registration.register_no, registration]));
  const teammateFor = (row: Assignment) => {
    const event = events.data?.find((item) => item.slug === row.event_slug);
    if (event?.team_size !== 2) return null;
    const registration = registrationByNumber.get(row.register_no);
    const savedTeammate = registration?.event_partners?.[row.event_slug];
    const teammateNumber = savedTeammate?.registerNumber ?? registration?.partner_register_no;
    const teammate = teammateNumber ? registrationByNumber.get(teammateNumber) : undefined;
    const teammateName = teammate?.full_name ?? savedTeammate?.fullName ?? registration?.partner_full_name;
    if (teammateName) return teammate?.register_no ? `${teammateName} (${teammate.register_no})` : teammateName;
    return teammateNumber ? `Register No. ${teammateNumber}` : null;
  };
  const scheduleItemsFor = (registrationId: string): ScheduleEmailItem[] => (assignments.data ?? [])
    .filter((row) => row.registration_id === registrationId)
    .sort((a, b) => a.slot_number - b.slot_number)
    .map((row) => ({ slotNumber: row.slot_number, eventName: row.event_name, startTime: time(row.start_time), endTime: time(row.end_time), room: row.room, teammate: teammateFor(row) }));
  const latestScheduleDelivery = new Map<string, ScheduleDelivery>();
  (scheduleDeliveries.data ?? []).forEach((delivery) => { if (delivery.registration_id && !latestScheduleDelivery.has(delivery.registration_id)) latestScheduleDelivery.set(delivery.registration_id, delivery); });
  const scheduleRecipients = (registrations.data ?? []).filter((registration) => registration.status === "complete" && registration.email && scheduleItemsFor(registration.id).length > 0);
  const sendOneSchedule = async (registration: SchedulerRegistration, manualResend = false) => {
    if (!registration.email || !registration.participant_id) throw new Error("This participant is missing an email address or participant ID.");
    const scheduleItems = scheduleItemsFor(registration.id);
    if (!scheduleItems.length) throw new Error("This participant does not have a generated schedule yet.");
    const schedulePass = await uploadSchedulePass(
      registration.participant_id,
      await getSchedulePassBlob({ fullName: registration.full_name, registerNumber: registration.register_no }, scheduleItems),
    );
    await sendScheduleEmail(registration.full_name, registration.email, registration.participant_id, scheduleItems, schedulePass.imageUrl, schedulePass.path, manualResend);
  };
  const resendSchedule = async (registration: SchedulerRegistration) => {
    setSendingRegistrationId(registration.id);
    try {
      await sendOneSchedule(registration, true);
      toast.success(`Schedule sent to ${registration.email}.`);
      queryClient.invalidateQueries({ queryKey: ["scheduler", "schedule-deliveries"] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't send schedule email."); }
    finally { setSendingRegistrationId(null); }
  };
  const sendMissingSchedules = async () => {
    if (!scheduleRecipients.length) return toast.error("Generate the schedule before sending emails.");
    const recipients = scheduleRecipients.filter((registration) => latestScheduleDelivery.get(registration.id)?.status !== "sent");
    if (!recipients.length) return toast.info("Schedule emails have already been sent to all scheduled participants.");
    setSendingSchedules(true);
    let sent = 0;
    let failed = 0;
    for (const registration of recipients) {
      try { await sendOneSchedule(registration); sent++; } catch { failed++; }
    }
    setSendingSchedules(false);
    queryClient.invalidateQueries({ queryKey: ["scheduler", "schedule-deliveries"] });
    if (failed) toast.error(`${sent} sent; ${failed} failed. Use Resend for the failed participants.`);
    else toast.success(`Schedule emails sent to ${sent} participant${sent === 1 ? "" : "s"}.`);
  };
  const exportExcel = () => {
    if (!assignments.data?.length) return toast.error("Generate the schedule before exporting Excel.");
    setExporting(true);
    try {
      const workbook = XLSX.utils.book_new();
      const allRows = assignments.data;
      const overview = XLSX.utils.aoa_to_sheet([
        ["TECHNOVANZA 2026 - FINAL EVENT SCHEDULE"],
        ["Conflict-checked timetable export"],
        [],
        ["Slot", "Time", "Assigned participants"],
        ...([1, 2] as const).map((slotNumber) => {
          const rows = allRows.filter((row) => row.slot_number === slotNumber);
          return [`Slot ${slotNumber}`, rows[0] ? `${time(rows[0].start_time)} - ${time(rows[0].end_time)}` : "-", rows.length];
        }),
      ]);
      overview["!cols"] = [{ wch: 16 }, { wch: 28 }, { wch: 24 }];
      XLSX.utils.book_append_sheet(workbook, overview, "Overview");

      for (const slotNumber of [1, 2] as const) {
        const rows = allRows.filter((row) => row.slot_number === slotNumber);
        const slotTime = rows[0] ? `${time(rows[0].start_time)} - ${time(rows[0].end_time)}` : "Not scheduled";
        const sheet = XLSX.utils.aoa_to_sheet([
          [`TECHNOVANZA 2026 - SLOT ${slotNumber}`],
          [`Time: ${slotTime}`],
          [],
          ["Event", "Room / Venue", "Time", "Participant Name", "Teammate", "Register Number"],
          ...rows.map((row) => [row.event_name, row.room, `${time(row.start_time)} - ${time(row.end_time)}`, row.full_name, teammateFor(row) ?? "-", String(row.register_no)]),
        ]);
        sheet["!cols"] = [{ wch: 25 }, { wch: 34 }, { wch: 24 }, { wch: 30 }, { wch: 32 }, { wch: 20 }];
        sheet["!autofilter"] = { ref: `A4:F${Math.max(rows.length + 4, 4)}` };
        for (let index = 0; index < rows.length; index++) {
          const cell = sheet[`F${index + 5}`];
          if (cell) { cell.t = "s"; cell.z = "@"; }
        }
        XLSX.utils.book_append_sheet(workbook, sheet, `Slot ${slotNumber}`);
      }
      XLSX.writeFile(workbook, "TECHNOVANZA-2026-Final-Schedule.xlsx");
      toast.success("Excel schedule downloaded.");
    } catch (error) {
      console.error(error);
      toast.error("Couldn't export the Excel schedule.");
    } finally {
      setExporting(false);
    }
  };

  const selectedScheduleDelivery = selectedScheduleParticipant ? latestScheduleDelivery.get(selectedScheduleParticipant.id) : undefined;
  const selectedScheduleDeliveryLabel = selectedScheduleDelivery?.status === "sent" ? "Sent" : selectedScheduleDelivery?.status === "sending" ? "Sending" : selectedScheduleDelivery?.status === "failed" ? "Failed" : "Not sent";
  const loading = registrations.isLoading || events.isLoading || slots.isLoading || teams.isLoading;
  return <div className="flex flex-col gap-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h1 className="font-display text-2xl font-bold text-foreground">Conflict-Free Schedule</h1><p className="text-sm text-muted-foreground">Approve 12 TechTalks teams, then create two non-overlapping event slots for every participant and teammate.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={refresh}><RefreshCw className="size-4" /> Refresh</Button><Button variant="outline" onClick={exportExcel} disabled={exporting}><FileDown className="size-4" /> {exporting ? "Exporting…" : "Export Excel"}</Button><Button variant="outline" onClick={sendMissingSchedules} disabled={sendingSchedules || !assignments.data?.length}><Mail className="size-4" /> {sendingSchedules ? "Sending…" : "Send Schedule Emails"}</Button><Button onClick={generate} disabled={loading}><ShieldCheck className="size-4" /> Generate schedule</Button></div></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="size-4 text-primary" /> TechTalks paper approvals</CardTitle><p className="text-sm text-muted-foreground">Approve a maximum of 12 teams. Only approved teams receive one of the 6 team places in Slot 1 or Slot 2. Their selected non-technical event is placed in the opposite slot.</p></CardHeader><CardContent>{teams.isLoading ? <p>Loading teams…</p> : <div className="grid gap-3 md:grid-cols-2">{teams.data?.map((team) => <div key={team.team_key} className="flex items-center justify-between rounded-xl border border-border p-3"><div><p className="font-medium">{team.member_one_name ?? team.member_one_register_no} + {team.member_two_name ?? team.member_two_register_no}</p><p className="text-xs text-muted-foreground">{team.member_one_register_no} · {team.member_two_register_no}</p></div><Button size="sm" variant={team.approved ? "default" : "outline"} onClick={() => setTeamApproval(team, !team.approved)}>{team.approved ? "Approved" : "Approve"}</Button></div>)}</div>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Generated assignments</CardTitle><p className="text-sm text-muted-foreground">Every row has been assigned using the participant’s selected event. Click a participant name to view their complete schedule and send a test email.</p></CardHeader><CardContent>{assignments.isLoading ? <p>Loading…</p> : !assignments.data?.length ? <p className="text-sm text-muted-foreground">No generated schedule yet. Approve the selected TechTalks teams and click Generate schedule.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Slot</TableHead><TableHead>Time</TableHead><TableHead>Event</TableHead><TableHead>Room</TableHead><TableHead>Participant</TableHead><TableHead>Register No.</TableHead></TableRow></TableHeader><TableBody>{assignments.data.map((row) => <TableRow key={row.id}><TableCell><Badge>{`Slot ${row.slot_number}`}</Badge></TableCell><TableCell>{time(row.start_time)} - {time(row.end_time)}</TableCell><TableCell>{row.event_name}</TableCell><TableCell>{row.room}</TableCell><TableCell className="font-medium">{registrationByNumber.get(row.register_no) ? <button type="button" className="text-left font-medium text-primary underline-offset-4 hover:underline" onClick={() => setSelectedScheduleParticipant(registrationByNumber.get(row.register_no)!)}>{row.full_name}</button> : row.full_name}</TableCell><TableCell>{row.register_no}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Mail className="size-4 text-primary" /> Schedule email delivery</CardTitle><p className="text-sm text-muted-foreground">Each participant receives their own Slot 1 and Slot 2 events, times, venues, and teammate details. The Delivery column records whether their email was sent, failed, or has not been sent.</p></CardHeader><CardContent>{scheduleDeliveries.isLoading ? <p>Loading delivery status…</p> : !scheduleRecipients.length ? <p className="text-sm text-muted-foreground">Generate the schedule before sending schedule emails.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Participant</TableHead><TableHead>Gmail</TableHead><TableHead>Schedule</TableHead><TableHead>Delivery</TableHead><TableHead>Action</TableHead></TableRow></TableHeader><TableBody>{scheduleRecipients.map((registration) => { const delivery = latestScheduleDelivery.get(registration.id); const deliveryLabel = delivery?.status === "sent" ? "Sent" : delivery?.status === "sending" ? "Sending" : delivery?.status === "failed" ? "Failed" : "Not sent"; return <TableRow key={registration.id}><TableCell className="font-medium">{registration.full_name}</TableCell><TableCell>{registration.email}</TableCell><TableCell>{scheduleItemsFor(registration.id).map((item) => <span key={`${item.slotNumber}-${item.eventName}`} className="mr-2 inline-block"><Badge variant="secondary">Slot {item.slotNumber}: {item.eventName}</Badge></span>)}</TableCell><TableCell><Badge variant={delivery?.status === "sent" ? "secondary" : delivery?.status === "failed" ? "destructive" : "outline"}>{deliveryLabel}</Badge>{delivery?.error_message ? <p className="mt-1 max-w-56 text-xs text-destructive">{delivery.error_message}</p> : null}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => setSelectedScheduleParticipant(registration)}>{sendingRegistrationId === registration.id ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} {delivery?.status === "sent" ? "View & resend" : "View & send"}</Button></TableCell></TableRow>; })}</TableBody></Table></div>}</CardContent></Card>
    <Dialog open={!!selectedScheduleParticipant} onOpenChange={(open) => !open && setSelectedScheduleParticipant(null)}><DialogContent><DialogHeader><DialogTitle>Send personal schedule</DialogTitle></DialogHeader>{selectedScheduleParticipant ? <div className="space-y-4"><div><p className="text-lg font-semibold">{selectedScheduleParticipant.full_name}</p><p className="text-sm text-muted-foreground">{selectedScheduleParticipant.email}</p><div className="mt-2 text-sm">Email status: <Badge variant={selectedScheduleDelivery?.status === "sent" ? "secondary" : selectedScheduleDelivery?.status === "failed" ? "destructive" : "outline"}>{selectedScheduleDeliveryLabel}</Badge></div>{selectedScheduleDelivery?.error_message ? <p className="mt-2 text-sm text-destructive">{selectedScheduleDelivery.error_message}</p> : null}</div><div className="space-y-3">{scheduleItemsFor(selectedScheduleParticipant.id).map((item) => <div key={`${item.slotNumber}-${item.eventName}`} className="rounded-xl border border-border p-3"><p className="text-xs font-bold text-primary">SLOT {item.slotNumber}</p><p className="font-semibold">{item.eventName}</p><p className="text-sm text-muted-foreground">{item.startTime} – {item.endTime} · {item.room}</p>{item.teammate ? <p className="mt-1 text-sm text-muted-foreground">Team: {item.teammate}</p> : null}</div>)}</div><p className="text-sm text-muted-foreground">A current schedule-pass PNG will be created in the schedule-passes bucket and attached to this email.</p><Button className="w-full" onClick={() => resendSchedule(selectedScheduleParticipant)} disabled={sendingRegistrationId === selectedScheduleParticipant.id}>{sendingRegistrationId === selectedScheduleParticipant.id ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} {selectedScheduleDelivery?.status === "sent" ? "Resend schedule email" : "Send schedule email"}</Button></div> : null}</DialogContent></Dialog>
  </div>;
}

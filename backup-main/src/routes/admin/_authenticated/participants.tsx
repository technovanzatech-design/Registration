import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/_authenticated/participants")({
  head: () => ({ meta: [{ title: "Participants — TECHNOVANZA 2026 Admin" }] }),
  component: ParticipantsPage,
});

type Registration = {
  id: string;
  participant_id: string;
  full_name: string;
  register_no: string;
  college_name: string;
  email: string;
  phone: string;
  events: string[];
  partner_full_name?: string | null;
  partner_register_no?: string | null;
  partner_email?: string | null;
  partner_phone?: string | null;
  event_partners?: Record<
    string,
    { fullName?: string; registerNumber?: string; email?: string; phone?: string }
  > | null;
  status: "pending_partner" | "complete";
  attendance: boolean;
  created_at: string;
};

type EventOption = { slug: string; name: string; category: "technical" | "non-technical" };

type SortField = "created_at" | "full_name" | "college_name";
type CategoryFilter = "all" | "technical" | "non-technical";

const PAGE_SIZE = 20;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useMemo(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return debounced;
}

// Builds a PostgREST "contains any of these slugs" filter string for the
// jsonb `events` array column, since there's no native "overlap" operator
// for jsonb — we OR together one "contains [slug]" check per slug.
function slugOverlapFilter(slugs: string[]): string {
  return slugs.map((s) => `events.cs.["${s}"]`).join(",");
}

function ParticipantsPage() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 350);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Registration | null>(null);

  const filterKey = `${search}|${eventFilter}|${categoryFilter}|${sortField}|${sortAsc}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(0);
  }

  const eventsQuery = useQuery({
    queryKey: ["admin", "events", "options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("slug, name, category")
        .order("name");
      if (error) throw error;
      return (data ?? []) as EventOption[];
    },
  });

  const technicalSlugs = useMemo(
    () => (eventsQuery.data ?? []).filter((e) => e.category === "technical").map((e) => e.slug),
    [eventsQuery.data],
  );
  const nonTechnicalSlugs = useMemo(
    () => (eventsQuery.data ?? []).filter((e) => e.category === "non-technical").map((e) => e.slug),
    [eventsQuery.data],
  );

  // Independent of search/pagination — always reflects the true totals.
  const categoryCountsQuery = useQuery({
    queryKey: ["admin", "registrations", "category-counts", technicalSlugs, nonTechnicalSlugs],
    enabled: !!eventsQuery.data,
    queryFn: async () => {
      const [techRes, nonTechRes] = await Promise.all([
        technicalSlugs.length
          ? supabase
              .from("registrations")
              .select("id", { count: "exact", head: true })
              .or(slugOverlapFilter(technicalSlugs))
          : Promise.resolve({ count: 0, error: null }),
        nonTechnicalSlugs.length
          ? supabase
              .from("registrations")
              .select("id", { count: "exact", head: true })
              .or(slugOverlapFilter(nonTechnicalSlugs))
          : Promise.resolve({ count: 0, error: null }),
      ]);
      if (techRes.error) throw techRes.error;
      if (nonTechRes.error) throw nonTechRes.error;
      return { technical: techRes.count ?? 0, nonTechnical: nonTechRes.count ?? 0 };
    },
  });

  const registrationsQuery = useQuery({
    queryKey: [
      "admin",
      "registrations",
      "list",
      filterKey,
      page,
      technicalSlugs,
      nonTechnicalSlugs,
    ],
    enabled: !!eventsQuery.data,
    queryFn: async () => {
      let query = supabase
        .from("registrations")
        .select(
          "id, participant_id, full_name, register_no, college_name, email, phone, events, partner_full_name, partner_register_no, partner_email, partner_phone, event_partners, status, attendance, created_at",
          { count: "exact" },
        );

      if (search.trim()) {
        const term = search.trim();
        query = query.or(
          [
            `full_name.ilike.%${term}%`,
            `email.ilike.%${term}%`,
            `phone.ilike.%${term}%`,
            `register_no.ilike.%${term}%`,
          ].join(","),
        );
      }

      if (eventFilter !== "all") {
        query = query.contains("events", [eventFilter]);
      } else if (categoryFilter !== "all") {
        const slugs = categoryFilter === "technical" ? technicalSlugs : nonTechnicalSlugs;
        if (slugs.length) query = query.or(slugOverlapFilter(slugs));
      }

      query = query.order(sortField, { ascending: sortAsc });

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as Registration[], count: count ?? 0 };
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((a) => !a);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const totalPages = registrationsQuery.data
    ? Math.max(1, Math.ceil(registrationsQuery.data.count / PAGE_SIZE))
    : 1;
  const [exporting, setExporting] = useState(false);
  const eventNameBySlug = useMemo(
    () => new Map((eventsQuery.data ?? []).map((event) => [event.slug, event.name])),
    [eventsQuery.data],
  );

  const exportExcel = async () => {
    setExporting(true);
    try {
      let query = supabase
        .from("registrations")
        .select(
          "participant_id, full_name, register_no, college_name, email, phone, events, partner_full_name, event_partners, status, attendance, created_at",
        );

      if (search.trim()) {
        const term = search.trim();
        query = query.or(
          [
            `full_name.ilike.%${term}%`,
            `email.ilike.%${term}%`,
            `phone.ilike.%${term}%`,
            `register_no.ilike.%${term}%`,
          ].join(","),
        );
      }

      if (eventFilter !== "all") {
        query = query.contains("events", [eventFilter]);
      } else if (categoryFilter !== "all") {
        const slugs = categoryFilter === "technical" ? technicalSlugs : nonTechnicalSlugs;
        if (slugs.length) query = query.or(slugOverlapFilter(slugs));
      }

      query = query.order(sortField, { ascending: sortAsc });

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as Registration[];

      const categoryBySlug = new Map((eventsQuery.data ?? []).map((e) => [e.slug, e.category]));

      const sheetData = rows.map((r) => {
        const technical = r.events.filter((slug) => categoryBySlug.get(slug) === "technical");
        const nonTechnical = r.events.filter(
          (slug) => categoryBySlug.get(slug) === "non-technical",
        );

        return {
          "Participant ID": r.participant_id,
          "Full Name": r.full_name,
          "Register No.": r.register_no,
          College: r.college_name,
          Email: r.email,
          Phone: r.phone,
          "Technical Events": technical.join("; ") || "-",
          "Non-Technical Events": nonTechnical.join("; ") || "-",
          "Team Members":
            Object.entries(r.event_partners ?? {})
              .map(([event, teammate]) => `${event}: ${teammate.fullName ?? "-"}`)
              .join("; ") ||
            r.partner_full_name ||
            "-",
          Status: r.status === "complete" ? "Complete" : "Pending teammate",
          Attendance: r.attendance ? "Present" : "Not marked",
          "Registered At": new Date(r.created_at).toLocaleString(),
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(sheetData);

      // Force Register No. and Phone columns to plain text (type "s"),
      // so Excel/Sheets never reinterprets them as numbers.
      const registerNoCol = "C"; // 3rd column
      const phoneCol = "F"; // 6th column
      const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
      for (let row = range.s.r + 1; row <= range.e.r; row++) {
        for (const col of [registerNoCol, phoneCol]) {
          const cellRef = `${col}${row + 1}`;
          const cell = worksheet[cellRef];
          if (cell) {
            cell.t = "s";
            cell.z = "@"; // text format
          }
        }
      }

      // Reasonable column widths so it doesn't look squished on open.
      worksheet["!cols"] = [
        { wch: 15 }, // Participant ID
        { wch: 20 }, // Full Name
        { wch: 16 }, // Register No.
        { wch: 24 }, // College
        { wch: 26 }, // Email
        { wch: 14 }, // Phone
        { wch: 28 }, // Technical Events
        { wch: 32 }, // Non-Technical Events
        { wch: 34 }, // Team Members
        { wch: 12 }, // Attendance
        { wch: 20 }, // Registered At
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Participants");

      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `participants-${stamp}.xlsx`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't export Excel file.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Participants</h1>
        <p className="text-sm text-muted-foreground">
          {registrationsQuery.data
            ? `${registrationsQuery.data.count} matching registration${
                registrationsQuery.data.count === 1 ? "" : "s"
              }`
            : "Loading…"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Technical event registrations</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryCountsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : categoryCountsQuery.isError ? (
              <p className="text-sm text-destructive">Couldn't load count.</p>
            ) : (
              <p className="font-display text-3xl font-bold text-foreground">
                {categoryCountsQuery.data?.technical ?? 0}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Non-technical event registrations</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryCountsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : categoryCountsQuery.isError ? (
              <p className="text-sm text-destructive">Couldn't load count.</p>
            ) : (
              <p className="font-display text-3xl font-bold text-foreground">
                {categoryCountsQuery.data?.nonTechnical ?? 0}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">All registrations</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              onClick={exportExcel}
              disabled={exporting || registrationsQuery.isLoading}
            >
              {exporting ? "Exporting…" : "Export Excel"}
            </Button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Name, email, phone, reg. no…"
                className="w-64 pl-8"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                setCategoryFilter(v as CategoryFilter);
                setEventFilter("all");
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="non-technical">Non-Technical</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={eventFilter}
              onValueChange={(v) => {
                setEventFilter(v);
                setCategoryFilter("all");
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {eventsQuery.data?.map((ev) => (
                  <SelectItem key={ev.slug} value={ev.slug}>
                    {ev.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {registrationsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : registrationsQuery.isError ? (
            <p className="text-sm text-destructive">Couldn't load participants.</p>
          ) : !registrationsQuery.data || registrationsQuery.data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No participants match these filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        label="Name"
                        active={sortField === "full_name"}
                        asc={sortAsc}
                        onClick={() => toggleSort("full_name")}
                      />
                      <TableHead>Register No.</TableHead>
                      <SortableHead
                        label="College"
                        active={sortField === "college_name"}
                        asc={sortAsc}
                        onClick={() => toggleSort("college_name")}
                      />
                      <TableHead>Events</TableHead>
                      <TableHead>Status</TableHead>
                      <SortableHead
                        label="Registered"
                        active={sortField === "created_at"}
                        asc={sortAsc}
                        onClick={() => toggleSort("created_at")}
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrationsQuery.data.rows.map((r) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(r)}
                      >
                        <TableCell className="font-medium text-foreground">{r.full_name}</TableCell>
                        <TableCell className="text-muted-foreground">{r.register_no}</TableCell>
                        <TableCell className="text-muted-foreground">{r.college_name}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {r.events.map((slug) => (
                              <Badge key={slug} variant="secondary" className="text-xs">
                                {slug}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.status === "complete" ? "default" : "outline"}>
                            {r.status === "complete" ? "Complete" : "Pending teammate"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.full_name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex flex-col gap-2 text-sm">
              <DetailRow label="Participant ID" value={selected.participant_id} />
              <DetailRow
                label="Registration status"
                value={selected.status === "complete" ? "Complete" : "Pending teammate completion"}
              />
              <DetailRow label="Register No." value={selected.register_no} />
              <DetailRow label="College" value={selected.college_name} />
              <DetailRow label="Email" value={selected.email} />
              <DetailRow label="Phone" value={selected.phone} />
              <DetailRow
                label="Registered"
                value={new Date(selected.created_at).toLocaleString()}
              />
              <DetailRow
                label="Attendance"
                value={selected.attendance ? "Marked present" : "Not marked"}
              />
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-muted-foreground">Events</span>
                <div className="flex flex-wrap gap-1">
                  {selected.events.map((slug) => (
                    <Badge key={slug} variant="secondary">
                      {eventNameBySlug.get(slug) ?? slug}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <span className="font-medium text-foreground">Team details</span>
                {Object.entries(selected.event_partners ?? {}).length > 0 ? (
                  Object.entries(selected.event_partners ?? {}).map(([slug, teammate]) => (
                    <div key={slug} className="rounded-lg border border-border bg-secondary/30 p-3">
                      <p className="font-medium text-foreground">
                        {eventNameBySlug.get(slug) ?? slug}
                      </p>
                      <p className="mt-1 text-muted-foreground">{teammate.fullName ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">
                        {teammate.registerNumber ?? "-"} · {teammate.email ?? "-"} · {teammate.phone ?? "-"}
                      </p>
                    </div>
                  ))
                ) : selected.partner_full_name ? (
                  <div className="rounded-lg border border-border bg-secondary/30 p-3">
                    <p className="text-foreground">{selected.partner_full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selected.partner_register_no ?? "-"} · {selected.partner_email ?? "-"} · {selected.partner_phone ?? "-"}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Individual-event registration.</p>
                )}
              </div>
            </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableHead({
  label,
  active,
  asc,
  onClick,
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  return (
    <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={onClick}>
      {label}
      {active && <span className="ml-1">{asc ? "↑" : "↓"}</span>}
    </TableHead>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

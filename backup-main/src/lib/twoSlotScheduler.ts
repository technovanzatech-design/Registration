export type SchedulerRegistration = {
  id: string;
  register_no: string;
  full_name: string;
  status: string;
  events: string[];
  partner_register_no?: string | null;
  event_partners?: Record<string, { registerNumber?: string }> | null;
};

export type SchedulerEvent = { slug: string; category: "technical" | "non-technical"; team_size: number };
export type SchedulerSlot = { id: string; event_slug: string; slot_number: 1 | 2; participant_capacity: number | null };
export type ScheduleAssignment = { registration_id: string; event_slug: string; slot_id: string };

const partnerNo = (registration: SchedulerRegistration, event: string) =>
  registration.event_partners?.[event]?.registerNumber ?? registration.partner_register_no ?? null;

// A registration should contain each event once. This defensive helper keeps
// a legacy/manual duplicate in the JSON array from consuming a second seat
// during timetable generation.
const uniqueEvents = (registration: SchedulerRegistration) => [...new Set(registration.events)];

const teamKey = (registration: SchedulerRegistration, event: string) => {
  const partner = partnerNo(registration, event);
  return partner ? [registration.register_no, partner].sort().join(":") : null;
};

class UnionFind {
  private parent: number[];
  constructor(size: number) { this.parent = Array.from({ length: size }, (_, i) => i); }
  find(x: number): number { return this.parent[x] === x ? x : (this.parent[x] = this.find(this.parent[x])); }
  union(a: number, b: number) { const aa = this.find(a); const bb = this.find(b); if (aa !== bb) this.parent[bb] = aa; }
}

/**
 * Allocates connected duo-team members together. Every component receives one
 * technical slot and the opposite non-technical slot, so no team member can
 * have an overlap. TechTalks members are included only after team approval.
 */
export function createTwoSlotSchedule(
  rawRegistrations: SchedulerRegistration[],
  events: SchedulerEvent[],
  slots: SchedulerSlot[],
  approvedTechTalkTeams: Set<string>,
): { assignments: ScheduleAssignment[]; excludedTechTalkTeams: string[] } {
  const registrations = rawRegistrations.filter((r) => r.status === "complete");
  const eventBySlug = new Map(events.map((event) => [event.slug, event]));
  const byRegisterNo = new Map(registrations.map((r, index) => [r.register_no, index]));
  const union = new UnionFind(registrations.length);

  registrations.forEach((registration, index) => {
    uniqueEvents(registration).forEach((eventSlug) => {
      if (eventBySlug.get(eventSlug)?.team_size !== 2) return;
      const teammateIndex = byRegisterNo.get(partnerNo(registration, eventSlug) ?? "");
      if (teammateIndex != null) union.union(index, teammateIndex);
    });
  });

  const components = new Map<number, SchedulerRegistration[]>();
  registrations.forEach((registration, index) => {
    const root = union.find(index);
    components.set(root, [...(components.get(root) ?? []), registration]);
  });
  const slotByEventAndNumber = new Map(slots.map((slot) => [`${slot.event_slug}:${slot.slot_number}`, slot]));
  const used = new Map<string, number>();
  const assignments: ScheduleAssignment[] = [];
  const excludedTechTalkTeams = new Set<string>();

  const canFit = (items: Array<{ event: string }>, number: 1 | 2) => {
    const required = new Map<string, number>();
    items.forEach(({ event }) => required.set(event, (required.get(event) ?? 0) + 1));
    return [...required.entries()].every(([event, count]) => {
      const slot = slotByEventAndNumber.get(`${event}:${number}`);
      return Boolean(slot && (slot.participant_capacity == null || (used.get(slot.id) ?? 0) + count <= slot.participant_capacity));
    });
  };
  const add = (registration: SchedulerRegistration, event: string, number: 1 | 2) => {
    const slot = slotByEventAndNumber.get(`${event}:${number}`);
    if (!slot) throw new Error(`No Slot ${number} is configured for ${event}.`);
    used.set(slot.id, (used.get(slot.id) ?? 0) + 1);
    assignments.push({ registration_id: registration.id, event_slug: event, slot_id: slot.id });
  };

  // Schedule constrained groups first. A group that has a technical event
  // has only one possible non-technical slot (the opposite one), while a
  // participant without a technical event can use either slot. This prevents
  // flexible participants from consuming a seat needed by a constrained team.
  const groups = [...components.values()].sort((a, b) => {
    const technicalCount = (group: SchedulerRegistration[]) => group.reduce(
      (count, registration) => count + registration.events.filter((event) => eventBySlug.get(event)?.category === "technical").length,
      0,
    );
    return technicalCount(b) - technicalCount(a) || b.length - a.length;
  });

  type PlannedItem = {
    component: SchedulerRegistration[];
    technical: Array<{ registration: SchedulerRegistration; event: string }>;
    nonTechnical: Array<{ registration: SchedulerRegistration; event: string }>;
    candidates: Array<{ technicalSlot: 1 | 2 | null; nonTechnicalSlot: 1 | 2 | null }>;
  };

  const items: PlannedItem[] = groups.map((component) => {
    const technical = component.flatMap((registration) => uniqueEvents(registration)
      .filter((event) => eventBySlug.get(event)?.category === "technical")
      .flatMap((event) => {
        if (event !== "techtalks") return [{ registration, event }];
        const key = teamKey(registration, event);
        if (key && approvedTechTalkTeams.has(key)) return [{ registration, event }];
        if (key) excludedTechTalkTeams.add(key);
        return [];
      }));
    const nonTechnical = component.flatMap((registration) => uniqueEvents(registration)
      .filter((event) => eventBySlug.get(event)?.category === "non-technical")
      .map((event) => ({ registration, event })));

    return {
      component,
      technical,
      nonTechnical,
      // Each option is a complete, non-overlapping two-event timetable for
      // this connected group.
      candidates: technical.length
      ? [{ technicalSlot: 1, nonTechnicalSlot: nonTechnical.length ? 2 : null }, { technicalSlot: 2, nonTechnicalSlot: nonTechnical.length ? 1 : null }]
      : nonTechnical.length
        ? [{ technicalSlot: null, nonTechnicalSlot: 1 }, { technicalSlot: null, nonTechnicalSlot: 2 }]
        : [{ technicalSlot: null, nonTechnicalSlot: null }],
    };
  });

  const reserve = (entries: Array<{ event: string }>, number: 1 | 2 | null, direction: 1 | -1) => {
    if (!number) return;
    entries.forEach(({ event }) => {
      const slot = slotByEventAndNumber.get(`${event}:${number}`);
      if (!slot) throw new Error(`No Slot ${number} is configured for ${event}.`);
      used.set(slot.id, (used.get(slot.id) ?? 0) + direction);
    });
  };
  const candidateFits = (item: PlannedItem, candidate: PlannedItem["candidates"][number]) =>
    (!candidate.technicalSlot || canFit(item.technical.map((entry) => ({ event: entry.event })), candidate.technicalSlot)) &&
    (!candidate.nonTechnicalSlot || canFit(item.nonTechnical.map((entry) => ({ event: entry.event })), candidate.nonTechnicalSlot));
  const candidateLoad = (item: PlannedItem, candidate: PlannedItem["candidates"][number]) => {
    const load = (entries: Array<{ event: string }>, number: 1 | 2 | null) => !number ? 0 : entries.reduce((total, { event }) => {
      const slot = slotByEventAndNumber.get(`${event}:${number}`);
      return total + (slot?.participant_capacity ? ((used.get(slot.id) ?? 0) + 1) / slot.participant_capacity : 0);
    }, 0);
    return load(item.technical, candidate.technicalSlot) + load(item.nonTechnical, candidate.nonTechnicalSlot);
  };

  // Greedy assignment can fill one Nexus slot and only later discover that a
  // valid team needs that exact slot. Search both valid orientations and undo
  // earlier choices when needed. This is small (two possible slots per group)
  // but guarantees we do not reject a valid 30-participant event merely due to
  // registration order.
  const choices = new Map<number, PlannedItem["candidates"][number]>();
  let checkedBranches = 0;
  const place = (index: number): boolean => {
    if (index === items.length) return true;
    if (++checkedBranches > 250000) return false;
    const item = items[index];
    const validCandidates = item.candidates
      .filter((candidate) => candidateFits(item, candidate))
      .sort((a, b) => candidateLoad(item, a) - candidateLoad(item, b));
    for (const candidate of validCandidates) {
      reserve(item.technical, candidate.technicalSlot, 1);
      reserve(item.nonTechnical, candidate.nonTechnicalSlot, 1);
      choices.set(index, candidate);
      if (place(index + 1)) return true;
      choices.delete(index);
      reserve(item.nonTechnical, candidate.nonTechnicalSlot, -1);
      reserve(item.technical, candidate.technicalSlot, -1);
    }
    return false;
  };

  if (!place(0)) {
    const firstUnplaced = items[choices.size] ?? items[items.length - 1];
    const eventNames = [...new Set(firstUnplaced.nonTechnical.map((item) => item.event))].join(", ");
    throw new Error(`No conflict-free two-slot timetable is available for ${firstUnplaced.component.map((r) => r.full_name).join(", ")}. ${eventNames ? `The selected event (${eventNames}) needs more usable slot space.` : ""}`);
  }

  items.forEach((item, index) => {
    const choice = choices.get(index);
    if (!choice) return;
    if (choice.technicalSlot) item.technical.forEach(({ registration, event }) => add(registration, event, choice.technicalSlot!));
    if (choice.nonTechnicalSlot) item.nonTechnical.forEach(({ registration, event }) => add(registration, event, choice.nonTechnicalSlot!));
  });
  return { assignments, excludedTechTalkTeams: [...excludedTechTalkTeams] };
}

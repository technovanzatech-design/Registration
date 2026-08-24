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
    registration.events.forEach((eventSlug) => {
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

  for (const component of components.values()) {
    const technical = component.flatMap((registration) => registration.events
      .filter((event) => eventBySlug.get(event)?.category === "technical")
      .flatMap((event) => {
        if (event !== "techtalks") return [{ registration, event }];
        const key = teamKey(registration, event);
        if (key && approvedTechTalkTeams.has(key)) return [{ registration, event }];
        if (key) excludedTechTalkTeams.add(key);
        return [];
      }));
    const technicalSlot: 1 | 2 | null = !technical.length
      ? null
      : canFit(technical.map((item) => ({ event: item.event })), 1) && canFit(technical.map((item) => ({ event: item.event })), 2)
        ? (assignments.filter((a) => slots.find((slot) => slot.id === a.slot_id)?.slot_number === 1).length <= assignments.filter((a) => slots.find((slot) => slot.id === a.slot_id)?.slot_number === 2).length ? 1 : 2)
        : canFit(technical.map((item) => ({ event: item.event })), 1) ? 1 : canFit(technical.map((item) => ({ event: item.event })), 2) ? 2 : null;
    if (technical.length && technicalSlot == null) throw new Error(`No safe technical slot is available for ${component.map((r) => r.full_name).join(", ")}.`);
    technical.forEach(({ registration, event }) => add(registration, event, technicalSlot!));

    const nonTechnical = component.flatMap((registration) => registration.events
      .filter((event) => eventBySlug.get(event)?.category === "non-technical")
      .map((event) => ({ registration, event })));
    if (!nonTechnical.length) continue;
    const preferred: Array<1 | 2> = technicalSlot ? [technicalSlot === 1 ? 2 : 1] : [1, 2];
    const nonTechnicalSlot = preferred.find((number) => canFit(nonTechnical.map((item) => ({ event: item.event })), number));
    if (!nonTechnicalSlot) throw new Error(`No safe non-technical slot is available for ${component.map((r) => r.full_name).join(", ")}.`);
    nonTechnical.forEach(({ registration, event }) => add(registration, event, nonTechnicalSlot));
  }
  return { assignments, excludedTechTalkTeams: [...excludedTechTalkTeams] };
}

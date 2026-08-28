export type SchedulerRegistration = {
  id: string;
  participant_id?: string;
  register_no: string;
  full_name: string;
  email?: string;
  status: string;
  events: string[];
  partner_register_no?: string | null;
  event_partners?: Record<string, { fullName?: string; registerNumber?: string }> | null;
};

export type SchedulerEvent = { slug: string; category: "technical" | "non-technical"; team_size: number };
export type SchedulerSlot = { id: string; event_slug: string; slot_number: 1 | 2; participant_capacity: number | null };
export type ScheduleAssignment = { registration_id: string; event_slug: string; slot_id: string };

const partnerNo = (registration: SchedulerRegistration, event: string) =>
  registration.event_partners?.[event]?.registerNumber ?? registration.partner_register_no ?? null;

const uniqueEvents = (registration: SchedulerRegistration) => [...new Set(registration.events)];

const teamKey = (registration: SchedulerRegistration, event: string) => {
  const partner = partnerNo(registration, event);
  return partner ? [registration.register_no, partner].sort().join(":") : null;
};

type Unit = {
  key: string;
  event: string;
  registrations: SchedulerRegistration[];
  links: Set<string>;
};

/**
 * A duo is one unit for its selected event. Each person's own selected events
 * must be in opposite slots. This avoids wrongly forcing unrelated teams into
 * the same technical/non-technical orientation.
 */
export function createTwoSlotSchedule(
  rawRegistrations: SchedulerRegistration[],
  events: SchedulerEvent[],
  slots: SchedulerSlot[],
  approvedTechTalkTeams: Set<string>,
): { assignments: ScheduleAssignment[]; excludedTechTalkTeams: string[] } {
  const registrations = rawRegistrations.filter((registration) => registration.status === "complete");
  const eventBySlug = new Map(events.map((event) => [event.slug, event]));
  const slotByEventAndNumber = new Map(slots.map((slot) => [`${slot.event_slug}:${slot.slot_number}`, slot]));
  const units = new Map<string, Unit>();
  const registrationUnits = new Map<string, string[]>();
  const excludedTechTalkTeams = new Set<string>();

  const selectedEvents = (registration: SchedulerRegistration) => uniqueEvents(registration).filter((event) => {
    if (event !== "techtalks") return true;
    const key = teamKey(registration, event);
    if (!key || approvedTechTalkTeams.has(key)) return true;
    excludedTechTalkTeams.add(key);
    return false;
  });

  registrations.forEach((registration) => {
    selectedEvents(registration).forEach((event) => {
      const definition = eventBySlug.get(event);
      if (!definition) return;
      const partner = definition.team_size === 2 ? partnerNo(registration, event) : null;
      const key = partner ? `${event}:${[registration.register_no, partner].sort().join(":")}` : `${event}:${registration.register_no}`;
      const unit = units.get(key) ?? { key, event, registrations: [], links: new Set<string>() };
      if (!unit.registrations.some((member) => member.id === registration.id)) unit.registrations.push(registration);
      units.set(key, unit);
      registrationUnits.set(registration.id, [...(registrationUnits.get(registration.id) ?? []), key]);
    });
  });

  registrationUnits.forEach((keys) => {
    const distinct = [...new Set(keys)];
    for (let index = 0; index < distinct.length; index += 1) {
      for (let other = index + 1; other < distinct.length; other += 1) {
        units.get(distinct[index])?.links.add(distinct[other]);
        units.get(distinct[other])?.links.add(distinct[index]);
      }
    }
  });

  const visited = new Set<string>();
  const components: Array<{ units: Unit[]; colour: Map<string, 0 | 1> }> = [];
  for (const firstUnit of units.values()) {
    if (visited.has(firstUnit.key)) continue;
    const colour = new Map<string, 0 | 1>([[firstUnit.key, 0]]);
    const queue = [firstUnit.key];
    const component: Unit[] = [];
    while (queue.length) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);
      const unit = units.get(key)!;
      component.push(unit);
      const currentColour = colour.get(key)!;
      for (const neighbour of unit.links) {
        const expected = currentColour === 0 ? 1 : 0;
        const known = colour.get(neighbour);
        if (known == null) {
          colour.set(neighbour, expected);
          queue.push(neighbour);
        } else if (known !== expected) {
          throw new Error(`The registrations for ${unit.registrations.map((registration) => registration.full_name).join(", ")} contain overlapping event choices that cannot fit into two slots.`);
        }
      }
    }
    components.push({ units: component, colour });
  }

  components.sort((a, b) => b.units.length - a.units.length);
  const used = new Map<string, number>();
  const orientations = new Map<number, 0 | 1>();
  let checkedBranches = 0;
  const canPlace = (component: (typeof components)[number], orientation: 0 | 1) => component.units.every((unit) => {
    const slotNumber = ((component.colour.get(unit.key)! + orientation) % 2 === 0 ? 1 : 2) as 1 | 2;
    const slot = slotByEventAndNumber.get(`${unit.event}:${slotNumber}`);
    return Boolean(slot && (slot.participant_capacity == null || (used.get(slot.id) ?? 0) + unit.registrations.length <= slot.participant_capacity));
  });
  const reserve = (component: (typeof components)[number], orientation: 0 | 1, direction: 1 | -1) => component.units.forEach((unit) => {
    const slotNumber = ((component.colour.get(unit.key)! + orientation) % 2 === 0 ? 1 : 2) as 1 | 2;
    const slot = slotByEventAndNumber.get(`${unit.event}:${slotNumber}`);
    if (!slot) throw new Error(`No Slot ${slotNumber} is configured for ${unit.event}.`);
    used.set(slot.id, (used.get(slot.id) ?? 0) + direction * unit.registrations.length);
  });
  const place = (index: number): boolean => {
    if (index === components.length) return true;
    if (++checkedBranches > 250000) return false;
    for (const orientation of [0, 1] as const) {
      if (!canPlace(components[index], orientation)) continue;
      reserve(components[index], orientation, 1);
      orientations.set(index, orientation);
      if (place(index + 1)) return true;
      orientations.delete(index);
      reserve(components[index], orientation, -1);
    }
    return false;
  };

  if (!place(0)) {
    const firstUnplaced = components[orientations.size] ?? components[components.length - 1];
    const people = [...new Set(firstUnplaced.units.flatMap((unit) => unit.registrations.map((registration) => registration.full_name)))];
    const eventNames = [...new Set(firstUnplaced.units.map((unit) => unit.event))].join(", ");
    throw new Error(`No conflict-free two-slot timetable is available for ${people.join(", ")}. The selected event (${eventNames}) needs more usable slot space.`);
  }

  const assignments: ScheduleAssignment[] = [];
  components.forEach((component, index) => {
    const orientation = orientations.get(index)!;
    component.units.forEach((unit) => {
      const slotNumber = ((component.colour.get(unit.key)! + orientation) % 2 === 0 ? 1 : 2) as 1 | 2;
      const slot = slotByEventAndNumber.get(`${unit.event}:${slotNumber}`);
      if (!slot) throw new Error(`No Slot ${slotNumber} is configured for ${unit.event}.`);
      unit.registrations.forEach((registration) => assignments.push({ registration_id: registration.id, event_slug: unit.event, slot_id: slot.id }));
    });
  });
  return { assignments, excludedTechTalkTeams: [...excludedTechTalkTeams] };
}

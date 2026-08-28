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
  const registrationByNumber = new Map(registrations.map((registration) => [registration.register_no, registration]));
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

  // In older reservations, only the first member has the teammate's register
  // number saved. Resolve the reverse direction as well, so both members are
  // still one duo unit when the second member completes registration.
  const resolvedPartnerNo = (registration: SchedulerRegistration, event: string) => {
    const directPartner = partnerNo(registration, event);
    if (directPartner) return directPartner;
    return registrations.find((candidate) =>
      candidate.id !== registration.id &&
      uniqueEvents(candidate).includes(event) &&
      partnerNo(candidate, event) === registration.register_no,
    )?.register_no ?? null;
  };

  registrations.forEach((registration) => {
    selectedEvents(registration).forEach((event) => {
      const definition = eventBySlug.get(event);
      if (!definition) return;
      const partner = definition.team_size === 2 ? resolvedPartnerNo(registration, event) : null;
      const key = partner ? `${event}:${[registration.register_no, partner].sort().join(":")}` : `${event}:${registration.register_no}`;
      const unit = units.get(key) ?? { key, event, registrations: [], links: new Set<string>() };
      if (!unit.registrations.some((member) => member.id === registration.id)) unit.registrations.push(registration);
      const teammate = partner ? registrationByNumber.get(partner) : undefined;
      if (teammate && uniqueEvents(teammate).includes(event) && !unit.registrations.some((member) => member.id === teammate.id)) {
        unit.registrations.push(teammate);
      }
      units.set(key, unit);
      registrationUnits.set(registration.id, [...(registrationUnits.get(registration.id) ?? []), key]);
    });
  });

  registrationUnits.forEach((keys) => {
    const distinct = [...new Set(keys)];
    for (let index = 0; index < distinct.length; index += 1) {
      for (let other = index + 1; other < distinct.length; other += 1) {
        const firstKey = distinct[index]!;
        const secondKey = distinct[other]!;
        units.get(firstKey)?.links.add(secondKey);
        units.get(secondKey)?.links.add(firstKey);
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
  const eventTotals = new Map<string, number>();
  components.forEach((component) => component.units.forEach((unit) => {
    eventTotals.set(unit.event, (eventTotals.get(unit.event) ?? 0) + unit.registrations.length);
  }));
  const slotOneTargets = new Map<string, { lower: number; upper: number }>();
  eventTotals.forEach((total, event) => {
    const first = slotByEventAndNumber.get(`${event}:1`);
    const second = slotByEventAndNumber.get(`${event}:2`);
    if (!first || !second) throw new Error(`Both timetable slots must be configured for ${event}.`);
    const firstCapacity = first.participant_capacity ?? total;
    const secondCapacity = second.participant_capacity ?? total;
    slotOneTargets.set(event, {
      lower: Math.max(0, total - secondCapacity),
      upper: Math.min(total, firstCapacity),
    });
  });
  const slotOneCount = (component: (typeof components)[number], orientation: 0 | 1, event: string) => component.units.reduce((count, unit) => {
    const slotNumber = ((component.colour.get(unit.key)! + orientation) % 2 === 0 ? 1 : 2) as 1 | 2;
    return count + (unit.event === event && slotNumber === 1 ? unit.registrations.length : 0);
  }, 0);
  // For each remaining component, retain the minimum and maximum number of
  // participants it can still put into Slot 1 per event. This prunes branches
  // that can never balance a full event, instead of exhausting the generic
  // search limit and reporting a misleading capacity error.
  const remainingMinimum = Array.from({ length: components.length + 1 }, () => new Map<string, number>());
  const remainingMaximum = Array.from({ length: components.length + 1 }, () => new Map<string, number>());
  for (let index = components.length - 1; index >= 0; index -= 1) {
    const component = components[index]!;
    const nextMinimum = remainingMinimum[index + 1]!;
    const nextMaximum = remainingMaximum[index + 1]!;
    const minimum = remainingMinimum[index]!;
    const maximum = remainingMaximum[index]!;
    eventTotals.forEach((_, event) => {
      const first = slotOneCount(component, 0, event);
      const second = slotOneCount(component, 1, event);
      minimum.set(event, Math.min(first, second) + (nextMinimum.get(event) ?? 0));
      maximum.set(event, Math.max(first, second) + (nextMaximum.get(event) ?? 0));
    });
  }
  const remainingCanBalance = (index: number) => [...slotOneTargets.entries()].every(([event, target]) => {
    const slot = slotByEventAndNumber.get(`${event}:1`)!;
    const current = used.get(slot.id) ?? 0;
    return current + (remainingMinimum[index]!.get(event) ?? 0) <= target.upper &&
      current + (remainingMaximum[index]!.get(event) ?? 0) >= target.lower;
  });
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
  // Prefer the orientation that balances currently occupied event slots. This
  // avoids spending the search budget filling Slot 1 first and then falsely
  // reporting that a later, linked team cannot fit.
  const orientationLoad = (component: (typeof components)[number], orientation: 0 | 1) => component.units.reduce((total, unit) => {
    const slotNumber = ((component.colour.get(unit.key)! + orientation) % 2 === 0 ? 1 : 2) as 1 | 2;
    const slot = slotByEventAndNumber.get(`${unit.event}:${slotNumber}`);
    if (!slot?.participant_capacity) return total;
    return total + ((used.get(slot.id) ?? 0) + unit.registrations.length) / slot.participant_capacity;
  }, 0);
  const place = (index: number): boolean => {
    if (index === components.length) return true;
    if (!remainingCanBalance(index) || ++checkedBranches > 5000000) return false;
    const component = components[index]!;
    const orderedOrientations = ([0, 1] as const)
      .filter((orientation) => canPlace(component, orientation))
      .sort((left, right) => orientationLoad(component, left) - orientationLoad(component, right));
    for (const orientation of orderedOrientations) {
      reserve(component, orientation, 1);
      orientations.set(index, orientation);
      if (place(index + 1)) return true;
      orientations.delete(index);
      reserve(component, orientation, -1);
    }
    return false;
  };

  if (!place(0)) {
    const firstUnplaced = (components[orientations.size] ?? components[components.length - 1])!;
    const people = [...new Set(firstUnplaced.units.flatMap((unit) => unit.registrations.map((registration) => registration.full_name)))];
    const eventNames = [...new Set(firstUnplaced.units.map((unit) => unit.event))].join(", ");
    throw new Error(`No conflict-free two-slot timetable is available for ${people.join(", ")}. The selected event (${eventNames}) needs more usable slot space.`);
  }

  // Historical teammate reservations are occasionally asymmetric: one record
  // can point to B while B points to C for the same duo event.  Those records
  // may place a participant in two internal units, but the database rightly
  // accepts only one assignment per participant/event.  Keep the first stable
  // assignment (units are built in registration order) so an inconsistent
  // legacy partner field cannot make the entire timetable fail to save.
  const assignmentsByParticipantEvent = new Map<string, ScheduleAssignment>();
  components.forEach((component, index) => {
    const orientation = orientations.get(index)!;
    component.units.forEach((unit) => {
      const slotNumber = ((component.colour.get(unit.key)! + orientation) % 2 === 0 ? 1 : 2) as 1 | 2;
      const slot = slotByEventAndNumber.get(`${unit.event}:${slotNumber}`);
      if (!slot) throw new Error(`No Slot ${slotNumber} is configured for ${unit.event}.`);
      unit.registrations.forEach((registration) => {
        const assignmentKey = `${registration.id}:${unit.event}`;
        if (!assignmentsByParticipantEvent.has(assignmentKey)) {
          assignmentsByParticipantEvent.set(assignmentKey, { registration_id: registration.id, event_slug: unit.event, slot_id: slot.id });
        }
      });
    });
  });
  return { assignments: [...assignmentsByParticipantEvent.values()], excludedTechTalkTeams: [...excludedTechTalkTeams] };
}

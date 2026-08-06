export type EventCategory = "technical" | "non-technical";

export interface SymposiumEvent {
  id: string;
  name: string;
  icon: string;
  category: EventCategory;
  maxParticipants: string;
  description: string;
  rules: string[];
  duration: string;
  teamSize: string;
  venue: string;
  coordinator: string;
  contact: string;
}

export interface Registration {
  id: string;
  fullName: string;
  registerNumber: string;
  collegeName: string;
  email: string;
  phone: string;
  events: string[];
  createdAt: string;
  partnerFullName?: string | null;
  pendingTeammates?: Registration[];
}

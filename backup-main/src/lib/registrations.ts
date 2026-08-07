import { supabase } from "./supabase";
import type { Registration, ReservedTeammate } from "@/types";

export type RegistrationPayload = Omit<Registration, "id" | "createdAt" | "partnerFullName"> & {
  partnerFullName?: string;
  partnerRegisterNo?: string;
  partnerEmail?: string;
  partnerPhone?: string;
  techTalkPartner?: { fullName: string; registerNumber: string; email: string; phone: string };
  funFeastPartner?: { fullName: string; registerNumber: string; email: string; phone: string };
};

export async function getRegistrationStatus(registerNumber: string) {
  const { data, error } = await supabase.rpc("registration_status", {
    p_register_no: registerNumber,
  });
  if (error) throw error;
  return data as "new" | "pending_partner_technical" | "pending_partner_non-technical" | "complete";
}

export async function getReservedTeammate(registerNumber: string) {
  const { data, error } = await supabase.rpc("reserved_teammate_by_register_no", {
    p_register_no: registerNumber,
  });
  if (error) throw error;
  return data as ReservedTeammate | null;
}

export async function findReservedTeammateByContact(email: string, phone: string) {
  const { data, error } = await supabase.rpc("reserved_teammate_by_contact", {
    p_email: email,
    p_phone: phone,
  });
  if (error) throw error;
  return data as ReservedTeammate | null;
}

export async function getRegistrationContactOwner(email: string, phone: string) {
  const { data, error } = await supabase.rpc("registration_contact_owner", {
    p_email: email,
    p_phone: phone,
  });
  if (error) throw error;
  return data as { registerNumber: string; status: string } | null;
}

export async function getRegistrationCardDetails(participantId: string) {
  const { data, error } = await supabase.rpc("registration_card_details", {
    p_participant_id: participantId,
  });
  if (error) throw error;
  return data as {
    events: string[];
    status: string;
    eventPartners?: Registration["eventPartners"];
  } | null;
}

export async function teammateEventCount(teammate: {
  registerNumber: string;
  email: string;
  phone: string;
}) {
  const { data, error } = await supabase.rpc("teammate_event_count", {
    p_register_no: teammate.registerNumber,
    p_email: teammate.email,
    p_phone: teammate.phone,
  });
  if (error) throw error;
  return Number((data as { eventCount?: number } | null)?.eventCount ?? 0);
}

function toRegistration(payload: RegistrationPayload, data: Record<string, unknown>): Registration {
  const eventPartners =
    (data["event_partners"] as Registration["eventPartners"] | undefined) ??
    Object.fromEntries(
      payload.events.flatMap((event) => {
        const teammate =
          event === "techtalks"
            ? payload.techTalkPartner
            : event === "fun-feast" || event === "nexus"
              ? payload.funFeastPartner
              : undefined;
        return teammate ? [[event, { fullName: teammate.fullName }]] : [];
      }),
    );
  return {
    id: String(data["id"]),
    fullName: payload.fullName,
    registerNumber: payload.registerNumber,
    collegeName: payload.collegeName,
    email: payload.email,
    phone: payload.phone,
    events: (data["events"] as string[] | undefined) ?? payload.events,
    createdAt: String(data["created_at"]),
    partnerFullName:
      (data["partner_full_name"] as string | null | undefined) ?? payload.partnerFullName ?? null,
    eventPartners,
    pendingTeammates: (data["pending_teammates"] as Registration[] | undefined) ?? [],
  };
}

export async function createRegistration(payload: RegistrationPayload): Promise<Registration> {
  const { data, error } = await supabase.rpc("submit_registration", {
    payload: {
      fullName: payload.fullName,
      registerNumber: payload.registerNumber,
      collegeName: payload.collegeName,
      email: payload.email,
      phone: payload.phone,
      events: payload.events,
      partnerFullName: payload.partnerFullName,
      partnerRegisterNo: payload.partnerRegisterNo,
      partnerEmail: payload.partnerEmail,
      partnerPhone: payload.partnerPhone,
      techTalkPartner: payload.techTalkPartner,
      funFeastPartner: payload.funFeastPartner,
    },
  });
  if (error) throw error;
  const response = data as Record<string, unknown>;
  const details = await getRegistrationCardDetails(String(response["id"]));
  return toRegistration(payload, {
    ...response,
    ...(details
      ? {
          events: details.events,
          ...(details.eventPartners ? { event_partners: details.eventPartners } : {}),
        }
      : {}),
  });
}

export async function completePartnerRegistration(
  payload: RegistrationPayload,
): Promise<Registration> {
  const { data, error } = await supabase.rpc("complete_partner_registration", {
    payload: {
      fullName: payload.fullName,
      registerNumber: payload.registerNumber,
      collegeName: payload.collegeName,
      email: payload.email,
      phone: payload.phone,
      eventSlug: payload.events[0],
      partnerFullName: payload.partnerFullName,
      partnerRegisterNo: payload.partnerRegisterNo,
      partnerEmail: payload.partnerEmail,
      partnerPhone: payload.partnerPhone,
    },
  });
  if (error) throw error;
  const response = data as Record<string, unknown>;
  const details = await getRegistrationCardDetails(String(response["id"]));
  return toRegistration(payload, {
    ...response,
    ...(details
      ? {
          events: details.events,
          ...(details.eventPartners ? { event_partners: details.eventPartners } : {}),
        }
      : {}),
  });
}

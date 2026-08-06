import { supabase } from "./supabase";
import type { Registration } from "@/types";

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

function toRegistration(payload: RegistrationPayload, data: Record<string, unknown>): Registration {
  return {
    id: String(data.id),
    fullName: payload.fullName,
    registerNumber: payload.registerNumber,
    collegeName: payload.collegeName,
    email: payload.email,
    phone: payload.phone,
    events: payload.events,
    createdAt: String(data.created_at),
    partnerFullName:
      (data.partner_full_name as string | null | undefined) ?? payload.partnerFullName ?? null,
    pendingTeammates: (data.pending_teammates as Registration[] | undefined) ?? [],
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
  return toRegistration(payload, data as Record<string, unknown>);
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
  return toRegistration(payload, data as Record<string, unknown>);
}

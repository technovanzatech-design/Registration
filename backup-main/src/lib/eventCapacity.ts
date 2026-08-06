import { supabase } from "./supabase";

export type EventCapacityRow = {
  event_slug: string;
  event_name: string;
  capacity: number | null;
  registered_count: number;
  seats_remaining: number | null;
};

export async function getEventCapacities(): Promise<EventCapacityRow[]> {
  const { data, error } = await supabase.from("event_capacity_status").select("*");
  if (error) throw error;
  return (data ?? []) as EventCapacityRow[];
}

export async function getTotalRegistrations(): Promise<number> {
  const { data, error } = await supabase
    .from("registration_totals")
    .select("total_registrations")
    .single();
  if (error) throw error;
  return data?.total_registrations ?? 0;
}
import { supabase } from "./supabase";

export async function sendRegistrationEmail(
  studentName: string,
  studentEmail: string,
  participantId: string,
  imageUrl: string,
  pending = false,
  teammateComplete = false,
  cardBucket: "entry-passes" | "teammate-entry-passes" = "entry-passes",
  cardPath = `${participantId}.png`,
  manualResend = false,
) {
  const { data, error } = await supabase.functions.invoke("send-registration-email", {
    body: {
      studentName,
      studentEmail,
      participantId,
      imageUrl,
      pending,
      teammateComplete,
      cardBucket,
      cardPath,
      manualResend,
    },
  });

  if (error) {
    // supabase-js hides the actual response body behind error.context —
    // without this, you only ever see "non-2xx status code" and nothing
    // useful. Pull the real message out and surface it.
    let detail = error.message;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.text === "function") {
      try {
        const bodyText = await context.text();
        console.error("[send-registration-email] raw response:", bodyText);
        try {
          const parsed = JSON.parse(bodyText);
          detail = parsed.error || parsed.message || bodyText;
        } catch {
          detail = bodyText || detail;
        }
      } catch {
        // ignore — fall back to error.message
      }
    }
    throw new Error(detail);
  }

  return data;
}

export type ScheduleEmailItem = {
  slotNumber: 1 | 2;
  eventName: string;
  startTime: string;
  endTime: string;
  room: string;
  teammate?: string | null;
};

export async function sendScheduleEmail(
  studentName: string,
  studentEmail: string,
  participantId: string,
  scheduleItems: ScheduleEmailItem[],
  imageUrl: string,
  cardPath: string,
  manualResend = false,
) {
  const { data, error } = await supabase.functions.invoke("send-registration-email", {
    body: {
      studentName,
      studentEmail,
      participantId,
      scheduleEmail: true,
      scheduleItems,
      imageUrl,
      manualResend,
      cardBucket: "schedule-passes",
      cardPath,
    },
  });
  if (error) {
    let detail = error.message;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.text === "function") {
      try {
        const bodyText = await context.text();
        const parsed = JSON.parse(bodyText);
        detail = parsed.error || parsed.message || bodyText;
      } catch { /* Use the original Supabase error. */ }
    }
    throw new Error(detail);
  }
  return data;
}

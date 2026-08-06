import { supabase } from "./supabase";

export async function sendRegistrationEmail(
  studentName: string,
  studentEmail: string,
  participantId: string,
  imageUrl: string,
  pending = false,
) {
  const { data, error } = await supabase.functions.invoke("send-registration-email", {
    body: {
      studentName,
      studentEmail,
      participantId,
      imageUrl,
      pending,
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

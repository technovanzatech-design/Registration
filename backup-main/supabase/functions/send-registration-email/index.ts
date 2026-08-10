import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000; // 32768 bytes at a time — stays well under the argument-count limit
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const serviceClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  let deliveryId: string | null = null;
  // Handle browser preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const {
      studentName,
      studentEmail,
      participantId,
      imageUrl,
      pending = false,
      teammateComplete = false,
      cardBucket = "entry-passes",
      cardPath = `${participantId}.png`,
      manualResend = false,
    } = await req.json();
    const deliveryType = manualResend
      ? "manual_resend"
      : pending
        ? "pending_teammate"
        : teammateComplete
          ? "teammate_complete"
          : "registration";

    const { data: delivery, error: deliveryError } = await serviceClient
      .from("email_delivery_log")
      .insert({
        participant_id: participantId,
        recipient_name: studentName,
        recipient_email: studentEmail,
        card_bucket: cardBucket,
        card_path: cardPath,
        delivery_type: deliveryType,
        status: "sending",
      })
      .select("id")
      .single();
    if (deliveryError) console.error("Could not start email delivery log:", deliveryError.message);
    deliveryId = delivery?.id ?? null;
    const registrationUrl = Deno.env.get("REGISTRATION_URL") ?? "https://technovanza26.in";
    const pendingNotice = pending
      ? `<p><strong>Your teammate reserved your team-event seat.</strong> Use the button below to choose your remaining event with your register number, Gmail and phone number.</p>
         <p style="margin:28px 0"><a href="${registrationUrl}" style="display:inline-block;background:#ef4444;color:#ffffff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Complete registration</a></p>
         <p style="font-size:13px;color:#cbd5e1">If the button does not open, visit: <a href="${registrationUrl}" style="color:#67e8f9">${registrationUrl}</a></p>
         <p>Your provisional one-event card is attached.</p>`
      : "";
    const teammateCompleteNotice = teammateComplete
      ? `<p><strong>Your teammate completed your registration for both your Technical and Non-Technical events.</strong> You do not need to register again.</p>`
      : "";

    // Download PNG from Supabase Storage
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      throw new Error("Unable to download entry card.");
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = arrayBufferToBase64(imageBuffer);

    // Brevo API
    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": Deno.env.get("BREVO_API_KEY")!,
      },
      body: JSON.stringify({
        sender: {
          name: Deno.env.get("BREVO_SENDER_NAME"),
          email: Deno.env.get("BREVO_SENDER_EMAIL"),
        },

        to: [
          {
            email: studentEmail,
            name: studentName,
          },
        ],

        subject: pending
          ? "TECHNOVANZA 2026 - Complete Your Registration"
          : teammateComplete
            ? "TECHNOVANZA 2026 - Registration Completed by Your Teammate"
          : "TECHNOVANZA 2026 - Registration Confirmed",

        htmlContent: `
        <div style="font-family:Arial,sans-serif;padding:30px;background:#0f172a;color:white">
            <h2 style="color:#67e8f9">
                Registration Successful 🎉
            </h2>

            <p>Hi <strong>${studentName}</strong>,</p>

            ${pendingNotice}
            ${teammateCompleteNotice}

            <p>
                Thank you for registering for
                <strong>TECHNOVANZA 2026</strong>.
            </p>

            <p>
                Your Participant ID is:
            </p>

            <h2 style="color:#f472b6">
                ${participantId}
            </h2>

            <p>
                Your official Entry Pass is attached with this email.
            </p>

            <p>
                Please carry this pass along with your College ID.
            </p>

            <br/>

            <p>
                Regards,<br/>
                TECHNOVANZA 2026 Team
            </p>
        </div>
        `,

        attachment: [
          {
            name: `${participantId}.png`,
            content: base64Image,
          },
        ],
      }),
    });

    const data = await brevoResponse.json();

    if (!brevoResponse.ok) {
      if (deliveryId) {
        await serviceClient
          .from("email_delivery_log")
          .update({ status: "failed", error_message: data?.message ?? JSON.stringify(data), updated_at: new Date().toISOString() })
          .eq("id", deliveryId);
      }
      return new Response(JSON.stringify(data), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (deliveryId) {
      await serviceClient
        .from("email_delivery_log")
        .update({
          status: "sent",
          provider_message_id: data?.messageId ?? null,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);
    }

    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    if (deliveryId) {
      await serviceClient
        .from("email_delivery_log")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : String(err),
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);
    }
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
Deno.serve(async (req) => {
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
    } = await req.json();
    const pendingNotice = pending
      ? `<p><strong>Your teammate reserved your team-event seat.</strong> Return to registration with your register number, Gmail and phone number to choose your remaining event.</p><p>Your provisional one-event card is attached.</p>`
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
          : "TECHNOVANZA 2026 - Registration Confirmed",

        htmlContent: `
        <div style="font-family:Arial,sans-serif;padding:30px;background:#0f172a;color:white">
            <h2 style="color:#67e8f9">
                Registration Successful 🎉
            </h2>

            <p>Hi <strong>${studentName}</strong>,</p>

            ${pendingNotice}

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
      return new Response(JSON.stringify(data), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

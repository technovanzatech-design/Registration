import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

const serviceClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let logId: string | null = null;

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) throw new Error("Admin sign-in is required.");
    const callerClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) throw new Error("Admin sign-in is required.");
    const { data: admin } = await serviceClient.from("admin_profiles").select("id").eq("id", userData.user.id).maybeSingle();
    if (!admin) throw new Error("Only an approved admin can send food cards.");

    const { foodTokenId, studentName, studentEmail, imageUrl } = await req.json();
    if (!foodTokenId || !studentName || !studentEmail || !imageUrl) throw new Error("Food-token email details are incomplete.");

    const { data: token } = await serviceClient.from("food_tokens").select("id, token").eq("id", foodTokenId).maybeSingle();
    if (!token) throw new Error("Food token was not found.");

    const { data: log, error: logError } = await serviceClient
      .from("food_token_email_log")
      .insert({ food_token_id: token.id, recipient_email: studentEmail, status: "sending" })
      .select("id")
      .single();
    if (logError) throw logError;
    logId = log.id;

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error("Unable to download the food-token card.");
    const image = arrayBufferToBase64(await imageResponse.arrayBuffer());

    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": Deno.env.get("BREVO_API_KEY")! },
      body: JSON.stringify({
        sender: { name: Deno.env.get("BREVO_SENDER_NAME"), email: Deno.env.get("BREVO_SENDER_EMAIL") },
        to: [{ email: studentEmail, name: studentName }],
        subject: "TECHNOVANZA 2026 - Your Food Token",
        htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;background:#100808;color:#fff"><h1 style="margin:0;color:#ff4b4b">TECHNOVANZA 2026</h1><p style="letter-spacing:2px;color:#f0caca">OFFICIAL FOOD TOKEN</p><p>Hi <strong>${studentName}</strong>,</p><p>Your personal food-token QR card is attached.</p><p style="padding:14px;border:1px solid #ff5a5a;border-radius:10px;color:#ffe1e1"><strong>One QR = one food claim.</strong><br/>Show it at the food counter along with your college ID.</p><p style="color:#c5a4a4">Please do not share this QR code with anyone.</p></div>`,
        attachment: [{ name: `TECHNOVANZA-2026-Food-Token-${token.token}.png`, content: image }],
      }),
    });
    const result = await brevoResponse.json();
    if (!brevoResponse.ok) throw new Error(result?.message ?? "Email provider rejected the food-token email.");

    await serviceClient.from("food_token_email_log").update({ status: "sent", provider_message_id: result?.messageId ?? null, error_message: null, updated_at: new Date().toISOString() }).eq("id", logId);
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    if (logId) await serviceClient.from("food_token_email_log").update({ status: "failed", error_message: error instanceof Error ? error.message : String(error), updated_at: new Date().toISOString() }).eq("id", logId);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
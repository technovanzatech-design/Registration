import QRCode from "qrcode";
import { supabase } from "./supabase";

export async function createFoodCard(name: string, token: string): Promise<Blob> {
  const qr = await QRCode.toDataURL(`TECHNOVANZA-FOOD:${token}`, { width: 520, margin: 1, color: { dark: "#1d0808", light: "#fff7f4" } });
  const qrImage = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = qr; });
  const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 1200;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 900, 1200); gradient.addColorStop(0, "#090303"); gradient.addColorStop(1, "#360d0d"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 900, 1200);
  ctx.strokeStyle = "#e93030"; ctx.lineWidth = 3; ctx.strokeRect(25, 25, 850, 1150);
  ctx.textAlign = "center"; ctx.fillStyle = "#ff5151"; ctx.font = "800 52px Arial"; ctx.fillText("TECHNOVANZA 2026", 450, 150);
  ctx.fillStyle = "#d3b1b1"; ctx.font = "700 24px Arial"; ctx.fillText("OFFICIAL FOOD TOKEN", 450, 205);
  ctx.fillStyle = "#ffffff"; ctx.font = "800 46px Arial"; ctx.fillText(name.slice(0, 30), 450, 335);
  ctx.fillStyle = "#b99c9c"; ctx.font = "600 22px Arial"; ctx.fillText("Show this QR only at the food counter", 450, 390);
  ctx.fillStyle = "#fff7f4"; ctx.fillRect(190, 450, 520, 520); ctx.drawImage(qrImage, 190, 450, 520, 520);
  ctx.fillStyle = "#ff7676"; ctx.font = "800 25px Arial"; ctx.fillText("ONE FOOD TOKEN · ONE CLAIM", 450, 1060);
  ctx.fillStyle = "#b99c9c"; ctx.font = "600 20px Arial"; ctx.fillText("Bring your college ID for verification", 450, 1110);
  return await (await fetch(canvas.toDataURL("image/png"))).blob();
}

export async function uploadFoodCard(foodTokenId: string, card: Blob): Promise<string> {
  const path = `${foodTokenId}.png`;
  const { error } = await supabase.storage.from("food-token-cards").upload(path, card, { contentType: "image/png", upsert: true, cacheControl: "0" });
  if (error) throw error;
  await supabase.from("food_tokens").update({ card_path: path, card_issued_at: new Date().toISOString() }).eq("id", foodTokenId);
  const { data } = supabase.storage.from("food-token-cards").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

import type { Registration } from "@/types";
import { getEventById } from "@/data/events";
import { site } from "@/data/site";

const WIDTH = 810;
const HEIGHT = 1440; // 9:16 portrait
const STUB_HEIGHT = 400; // bottom stub band
const RADIUS = 30;
const NOTCH_R = 20;

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the entry card onto a canvas and returns it. Shared by download + email preview. */
function renderCard(registration: Registration): HTMLCanvasElement {
  const scale = 2; // crisp on retina / high-dpi screens
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * scale;
  canvas.height = HEIGHT * scale;
  canvas.style.width = `${WIDTH}px`;
  canvas.style.height = `${HEIGHT}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(scale, scale);

  // ---- outer card silhouette (rounded rect with two circular notches) ----
  roundedRectPath(ctx, 0, 0, WIDTH, HEIGHT, RADIUS);
  ctx.save();
  ctx.clip();

  const mainBottom = HEIGHT - STUB_HEIGHT;

  // Backgrounds
  const bg1 = ctx.createLinearGradient(0, 0, WIDTH, mainBottom);
  bg1.addColorStop(0, "#030303");
  bg1.addColorStop(1, "#0f0505");
  ctx.fillStyle = bg1;
  ctx.fillRect(0, 0, WIDTH, mainBottom);

  const bg2 = ctx.createLinearGradient(0, mainBottom, WIDTH, HEIGHT);
  bg2.addColorStop(0, "#0f0505");
  bg2.addColorStop(1, "#030303");
  ctx.fillStyle = bg2;
  ctx.fillRect(0, mainBottom, WIDTH, STUB_HEIGHT);

  // Soft glow accents
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  };
  glow(WIDTH / 2, 0, 380, "rgba(239,68,68,0.22)");
  glow(WIDTH - 50, mainBottom - 60, 320, "rgba(127,29,29,0.28)");
  glow(WIDTH / 2, HEIGHT, 360, "rgba(220,38,38,0.22)");

  // Faint dot-grid texture on the main panel
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let gx = 26; gx < WIDTH - 26; gx += 28) {
    for (let gy = 26; gy < mainBottom - 26; gy += 28) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Oversized faint watermark of the symposium name
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 130px 'Segoe UI', Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(site.symposium.split(" ")[0] ?? "", WIDTH / 2, mainBottom / 2 + 10);
  ctx.textAlign = "left";
  ctx.restore();

  // ---- perforated divider between main panel and stub ----
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(0, mainBottom);
  ctx.lineTo(WIDTH, mainBottom);
  ctx.stroke();
  ctx.restore();

  // Circular notches cut into the divider (left & right)
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(0, mainBottom, NOTCH_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(WIDTH, mainBottom, NOTCH_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // ============ MAIN PANEL HEADER (centered, "college conducts event" style) ============
  const padX = 52;
  const centerX = WIDTH / 2;
  const headerMaxWidth = WIDTH - padX * 2;

  ctx.textAlign = "center";

  // Icon badge, centered above the college name
  const badgeSize = 54;
  const badgeX = centerX - badgeSize / 2;
  const badgeY = 38;
  ctx.fillStyle = "rgba(103,232,249,0.12)";
  roundedRectPath(ctx, badgeX, badgeY, badgeSize, badgeSize, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(103,232,249,0.5)";
  ctx.lineWidth = 1.5;
  roundedRectPath(ctx, badgeX, badgeY, badgeSize, badgeSize, 14);
  ctx.stroke();
  ctx.strokeStyle = "#67e8f9";
  ctx.lineWidth = 2;
  roundedRectPath(ctx, badgeX + 15, badgeY + 15, badgeSize - 30, badgeSize - 30, 4);
  ctx.stroke();
  ctx.beginPath();
  [12, 27, 42].forEach((off) => {
    ctx.moveTo(badgeX + off, badgeY - 5);
    ctx.lineTo(badgeX + off, badgeY);
    ctx.moveTo(badgeX + off, badgeY + badgeSize);
    ctx.lineTo(badgeX + off, badgeY + badgeSize + 5);
  });
  ctx.stroke();

  // Organizing college name (the "conducted by" line)
  ctx.fillStyle = "#a9adcf";
  ctx.font = "700 16px 'Segoe UI', Arial, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    truncate(ctx, site.college.toUpperCase(), headerMaxWidth),
    centerX,
    badgeY + badgeSize + 30,
  );

  // "presents" connector label
  ctx.fillStyle = "#767aa3";
  ctx.font = "600 11px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("PRESENTS", centerX, badgeY + badgeSize + 50);

  // Event name — the big headline
  ctx.fillStyle = "#dc2626";
  ctx.font = "800 36px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(truncate(ctx, site.symposium, headerMaxWidth), centerX, badgeY + badgeSize + 92);

  // Theme subtitle
  ctx.fillStyle = "#a9adcf";
  ctx.font = "600 14px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(
    truncate(ctx, site.theme.toUpperCase(), headerMaxWidth),
    centerX,
    badgeY + badgeSize + 118,
  );

  ctx.textAlign = "left";

  // Divider under header
  const dividerY = badgeY + badgeSize + 142;
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, dividerY);
  ctx.lineTo(WIDTH - padX, dividerY);
  ctx.stroke();

  // ============ PARTICIPANT FIELDS ============
  const fieldWidth = WIDTH - padX * 2;

  const field = (y: number, label: string, value: string, accent = "#f5f6ff") => {
    ctx.fillStyle = "#8b8fb8";
    ctx.font = "700 15px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(label.toUpperCase(), padX, y);
    ctx.fillStyle = accent;
    ctx.font = "700 32px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(truncate(ctx, value, fieldWidth), padX, y + 40);
  };

  let rowY = dividerY + 60;
  const rowGap = 100;
  field(rowY, "Participant Name", registration.fullName);
  rowY += rowGap;
  field(rowY, "College", registration.collegeName);
  rowY += rowGap;
  field(rowY, "Register Number", registration.registerNumber, "#dc2626");
  rowY += rowGap;
  if (registration.partnerFullName) {
    field(rowY, "Teammate", registration.partnerFullName, "#ef4444");
    rowY += rowGap;
  }
  field(rowY, "Unique ID", registration.id, "#f472b6");

  // Registered events — one full-width row per event, large and easy to scan
  rowY += rowGap;
  ctx.fillStyle = "#8b8fb8";
  ctx.font = "700 15px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("REGISTERED EVENTS", padX, rowY);

  let listY = rowY + 26;
  const rowH = 64;
  const rowSpacing = 16;
  registration.events.forEach((id) => {
    const evt = getEventById(id);
    const label = evt ? evt.name : id;
    const accent = evt?.category === "non-technical" ? "#f472b6" : "#67e8f9";

    ctx.fillStyle = `${accent}1a`;
    roundedRectPath(ctx, padX, listY, WIDTH - padX * 2, rowH, 18);
    ctx.fill();
    ctx.strokeStyle = `${accent}55`;
    ctx.lineWidth = 1.5;
    roundedRectPath(ctx, padX, listY, WIDTH - padX * 2, rowH, 18);
    ctx.stroke();

    // small accent dot
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(padX + 26, listY + rowH / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f5f6ff";
    ctx.font = "700 21px 'Segoe UI', Arial, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(truncate(ctx, label, WIDTH - padX * 2 - 60), padX + 46, listY + rowH / 2 + 1);
    ctx.textBaseline = "alphabetic";

    listY += rowH + rowSpacing;
  });

  // Issued-on timestamp, from registration.createdAt
  const created = new Date(registration.createdAt);
  const issuedDate = created.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const issuedTime = created.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  ctx.fillStyle = "#767aa3";
  ctx.font = "600 14px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(`Issued on ${issuedDate} · ${issuedTime}`, padX, mainBottom - 60);

  // Footer note (anchored just above the perforated divider)
  ctx.fillStyle = "#767aa3";
  ctx.font = "600 14px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("Present this card with your college ID at entry.", padX, mainBottom - 26);

  // ============ STUB (bottom band) ============
  const stubCenterX = WIDTH / 2;

  ctx.textAlign = "center";
  ctx.fillStyle = "#a9adcf";
  ctx.font = "800 13px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("ENTRY CARD", stubCenterX, mainBottom + 46);

  ctx.fillStyle = "#f5f6ff";
  ctx.font = "800 26px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(truncate(ctx, registration.fullName, WIDTH - 80), stubCenterX, mainBottom + 86);

  // Unique ID, large + prominent
  ctx.fillStyle = "#8b8fb8";
  ctx.font = "700 13px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("UNIQUE ID", stubCenterX, mainBottom + 136);
  ctx.fillStyle = "#67e8f9";
  ctx.font = "800 32px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(registration.id, stubCenterX, mainBottom + 176);

  // Barcode-style decorative strip (visual only, not scannable data)
  const barY = mainBottom + 204;
  const barH = 52;
  const barLeft = padX;
  const barRight = WIDTH - padX;
  let bx = barLeft;
  let seed = hashCode(registration.id);
  ctx.fillStyle = "#e8e9ff";
  while (bx < barRight) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const w = 1 + (seed % 3);
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    if (seed % 5 !== 0) {
      ctx.fillRect(bx, barY, w, barH);
    }
    bx += w + 2;
  }

  ctx.fillStyle = "#8b8fb8";
  ctx.font = "600 11px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(registration.id, stubCenterX, barY + barH + 24);

  // Date / venue at the bottom of the stub
  ctx.fillStyle = "#a9adcf";
  ctx.font = "700 14px 'Segoe UI', Arial, sans-serif";
  wrapCentered(ctx, site.date, stubCenterX, HEIGHT - 54, WIDTH - 80, 18);
  ctx.fillStyle = "#767aa3";
  ctx.font = "600 12px 'Segoe UI', Arial, sans-serif";
  wrapCentered(ctx, `${site.time} · ${site.venue}`, stubCenterX, HEIGHT - 28, WIDTH - 80, 16);

  ctx.textAlign = "left";
  ctx.restore(); // undo outer clip

  // Outer border on top of everything
  ctx.strokeStyle = "rgba(103,232,249,0.35)";
  ctx.lineWidth = 1.5;
  roundedRectPath(ctx, 1, 1, WIDTH - 2, HEIGHT - 2, RADIUS);
  ctx.stroke();

  return canvas;
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function wrapCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let lineY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, cx, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, lineY);
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash || 1;
}

/** Renders and downloads the entry card as a PNG image. */
export function downloadEntryCard(registration: Registration) {
  const canvas = renderCard(registration);
  const link = document.createElement("a");
  link.download = `${site.symposium.replace(/\s/g, "-")}-Entry-Card-${registration.id}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/** Renders the entry card and returns it as a PNG data URL (for previews / email). */
export function getEntryCardDataUrl(registration: Registration): string {
  return renderCard(registration).toDataURL("image/png");
}

export async function getEntryCardBlob(registration: Registration): Promise<Blob> {
  const dataUrl = getEntryCardDataUrl(registration);

  const response = await fetch(dataUrl);

  return await response.blob();
}

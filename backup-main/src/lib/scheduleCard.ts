export type SchedulePassItem = {
  slotNumber: 1 | 2;
  eventName: string;
  startTime: string;
  endTime: string;
  room: string;
  teammate?: string | null;
};

const WIDTH = 900;
const HEIGHT = 1200;

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
};

export async function getSchedulePassBlob(
  participant: { fullName: string; registerNumber: string },
  items: SchedulePassItem[],
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = WIDTH * scale;
  canvas.height = HEIGHT * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the schedule pass.");
  ctx.scale(scale, scale);

  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#07070c");
  background.addColorStop(0.58, "#190707");
  background.addColorStop(1, "#07070c");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.055)";
  for (let x = 30; x < WIDTH; x += 28) for (let y = 30; y < HEIGHT; y += 28) {
    ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 3;
  roundRect(ctx, 18, 18, WIDTH - 36, HEIGHT - 36, 34);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#fca5a5";
  ctx.font = "600 21px Arial, sans-serif";
  ctx.fillText("ANJALAI AMMAL MAHALINGAM ENGINEERING COLLEGE", WIDTH / 2, 84);
  ctx.fillStyle = "#ef4444";
  ctx.font = "800 46px Arial, sans-serif";
  ctx.fillText("TECHNOVANZA 2026", WIDTH / 2, 145);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 19px Arial, sans-serif";
  ctx.fillText("PERSONAL EVENT SCHEDULE", WIDTH / 2, 182);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath(); ctx.moveTo(70, 218); ctx.lineTo(WIDTH - 70, 218); ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 17px Arial, sans-serif";
  ctx.fillText("PARTICIPANT NAME", 76, 270);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px Arial, sans-serif";
  ctx.fillText(participant.fullName, 76, 314);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 17px Arial, sans-serif";
  ctx.fillText("REGISTER NUMBER", 76, 358);
  ctx.fillStyle = "#f87171";
  ctx.font = "700 28px Arial, sans-serif";
  ctx.fillText(participant.registerNumber, 76, 396);

  const itemY = [460, 720];
  items.slice(0, 2).forEach((item, index) => {
    const y = itemY[index];
    const color = item.slotNumber === 1 ? "#22d3ee" : "#f472b6";
    roundRect(ctx, 62, y, WIDTH - 124, 215, 25);
    ctx.fillStyle = item.slotNumber === 1 ? "rgba(8, 70, 82, 0.55)" : "rgba(91, 18, 61, 0.55)";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "800 17px Arial, sans-serif";
    ctx.fillText(`SLOT ${item.slotNumber}`, 92, y + 38);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 30px Arial, sans-serif";
    ctx.fillText(item.eventName, 92, y + 83);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 20px Arial, sans-serif";
    ctx.fillText(`${item.startTime} – ${item.endTime}`, 92, y + 120);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 18px Arial, sans-serif";
    ctx.fillText(`Venue: ${item.room}`, 92, y + 153);
    if (item.teammate) ctx.fillText(`Team: ${item.teammate}`, 92, y + 187);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#fde68a";
  ctx.font = "700 19px Arial, sans-serif";
  ctx.fillText("Report 15 minutes before each slot.", WIDTH / 2, 1030);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "600 17px Arial, sans-serif";
  ctx.fillText("Bring your college ID and entry card.", WIDTH / 2, 1064);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 15px Arial, sans-serif";
  ctx.fillText("TECHNOVANZA 2026 • AAMEC CSE", WIDTH / 2, 1138);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not save schedule pass.")), "image/png"));
}

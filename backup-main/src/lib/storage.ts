import { supabase } from "./supabase";

export async function uploadEntryCard(
  participantId: string,
  blob: Blob,
  destination: "primary" | "teammate" = "primary",
): Promise<{ imageUrl: string; bucket: "entry-passes" | "teammate-entry-passes"; path: string }> {
  const fileName = `${participantId}.png`;
  const bucket = destination === "teammate" ? "teammate-entry-passes" : "entry-passes";

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, blob, {
      contentType: "image/png",
      // Entry cards may be corrected after registration. Do not allow an old
      // CDN copy to be reused after the same filename is overwritten.
      cacheControl: "0",
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(fileName);

  return {
    // The query value guarantees the Edge Function downloads the newest file
    // after an overwrite instead of a cached earlier PNG.
    imageUrl: `${data.publicUrl}?v=${Date.now()}`,
    bucket,
    path: fileName,
  };
}

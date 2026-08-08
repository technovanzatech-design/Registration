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
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(fileName);

  return { imageUrl: data.publicUrl, bucket, path: fileName };
}

import { supabase } from "./supabase";

export async function uploadEntryCard(
  participantId: string,
  blob: Blob,
): Promise<string> {
  const fileName = `${participantId}.png`;

  const { error } = await supabase.storage
    .from("entry-passes")
    .upload(fileName, blob, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from("entry-passes")
    .getPublicUrl(fileName);

  return data.publicUrl;
}
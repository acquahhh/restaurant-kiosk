"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { explainDbError, requireStaff, type ActionResult } from "@/lib/admin/auth";
import { getPexelsPhoto, searchPexels, type PexelsPhoto } from "@/lib/pexels";

const MAX_BYTES = 8 * 1024 * 1024;

function pexelsMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (m === "PEXELS_NOT_CONFIGURED") return "Add PEXELS_API_KEY to .env.local to search for photos (free at pexels.com/api).";
  if (m === "PEXELS_BAD_KEY") return "Pexels rejected the API key. Check PEXELS_API_KEY in .env.local.";
  if (m === "PEXELS_429") return "Too many searches this hour. Wait a few minutes and try again.";
  return "Could not reach Pexels. Check the internet connection and try again.";
}

export async function findPhotos(query: string): Promise<{ ok: true; photos: PexelsPhoto[] } | { ok: false; message: string }> {
  const q = query.trim().slice(0, 80);
  if (!q) return { ok: false, message: "Type what to search for." };
  await requireStaff();
  try {
    return { ok: true, photos: await searchPexels(q) };
  } catch (e) {
    return { ok: false, message: pexelsMessage(e) };
  }
}

/**
 * Copies the chosen Pexels photo into the restaurant's own storage bucket and
 * sets it on the meal, so the kiosk never depends on Pexels being online.
 */
export async function choosePhoto(itemId: string, photoId: number): Promise<ActionResult & { url?: string }> {
  if (!z.string().uuid().safeParse(itemId).success || !Number.isInteger(photoId)) return { ok: false, message: "Unknown photo." };
  const { supabase } = await requireStaff();

  let photo: PexelsPhoto;
  try {
    photo = await getPexelsPhoto(photoId);
  } catch (e) {
    return { ok: false, message: pexelsMessage(e) };
  }

  const res = await fetch(photo.large, { cache: "no-store" });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type.split(";")[0]!)) return { ok: false, message: "That photo could not be downloaded. Try another." };
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) return { ok: false, message: "That photo is too large. Try another." };

  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const path = `items/pexels-${photo.id}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("menu-images").upload(path, bytes, { contentType: type, cacheControl: "31536000" });
  if (uploadError) return { ok: false, message: `Saving the photo failed: ${uploadError.message}` };

  const url = supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
  const { error } = await supabase
    .from("menu_items")
    .update({ image_url: url, image_credit: `${photo.photographer} on Pexels (${photo.pageUrl})` })
    .eq("id", itemId);
  if (error) return { ok: false, message: explainDbError(error.message) };

  revalidatePath("/admin/menu");
  revalidatePath("/kiosk", "layout");
  return { ok: true, message: "Photo set.", url };
}

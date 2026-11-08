"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, allow, clientAddress } from "@/lib/server/rate-limit";

export interface SignInState {
  error: string | null;
  /** Echoed back so a failed attempt does not wipe the email field. */
  email: string;
}

/** Only allow redirects back into staff areas of this app. */
function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return /^\/(kitchen|admin)(\/|$)/.test(value) ? value : "/kitchen";
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const device = await clientAddress();
  if (!allow(`signin:${device}`, LIMITS.signInPerDevice.limit, LIMITS.signInPerDevice.windowMs)) {
    console.warn("[security] sign-in rate limit reached for", device);
    return { error: "Too many sign-in attempts from this device. Wait 10 minutes and try again.", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "That email and password do not match a staff account.", email };

  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", data.user.id).single();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { error: "This account has no staff access. Ask the restaurant administrator.", email };
  }

  const target = safeNext(formData.get("next"));
  // Kitchen accounts cannot open admin pages: send them where they can work.
  redirect(profile.role === "kitchen" && target.startsWith("/admin") ? "/kitchen" : target);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

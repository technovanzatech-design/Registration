import { supabase } from "./supabase";

export interface AdminSession {
  userId: string;
  email: string;
}

/**
 * Signs in with Supabase Auth, then checks the admin_profiles allow-list.
 * If the credentials are valid but the user isn't in admin_profiles, we
 * sign them straight back out — a valid Supabase Auth account (e.g. a
 * future participant-facing account, if one is ever added) must never be
 * enough on its own to reach the dashboard.
 */
export async function signInAdmin(
  email: string,
  password: string,
): Promise<AdminSession> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Sign in failed.");
  }

  const admin = await checkIsAdmin(data.user.id);

  if (!admin) {
    await supabase.auth.signOut();
    throw new Error("This account is not authorized for admin access.");
  }

  return { userId: data.user.id, email: data.user.email ?? email };
}

export async function signOutAdmin(): Promise<void> {
  await supabase.auth.signOut();
}

/** True if the given auth user id has a row in admin_profiles. */
export async function checkIsAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  return Boolean(data);
}

/**
 * Resolves the current admin session, or null if there isn't a
 * signed-in + authorized admin. Used by the protected-route guard.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;

  if (!user) return null;

  const admin = await checkIsAdmin(user.id);
  if (!admin) return null;

  return { userId: user.id, email: user.email ?? "" };
}
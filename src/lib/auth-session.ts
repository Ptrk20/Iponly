import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

export async function getCurrentSession() {
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
}

export async function getCurrentUser() {
  const currentSession = await getCurrentSession();
  return currentSession?.user ?? null;
}

export async function requireUser() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  return currentUser;
}
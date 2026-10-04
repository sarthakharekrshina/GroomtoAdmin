"use server";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * send-otp / verify-otp answer every failure with JSON `{ error }` and a
 * 4xx/5xx status ("Too many attempts…", "Incorrect code…"), but supabase-js
 * reports only "Edge Function returned a non-2xx status code". Read the
 * function's own message so the admin sees the real reason.
 */
async function edgeFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response | undefined;
    try {
      const body = (await res?.clone().json()) as { error?: unknown } | undefined;
      if (typeof body?.error === "string" && body.error.trim()) return body.error;
    } catch {
      // Not JSON — fall back to the status below.
    }
    if (res?.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
    if (res?.status === 404) return "The sign-in service isn't reachable right now.";
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

/**
 * Mirrors the Partner App's primary OTP path (lib/services/supabase_service.dart
 * → sendOtp): the `send-otp` edge function delivers via WhatsApp/email. We
 * deliberately don't wire the Firebase fallback here — that exists in the
 * Flutter app for consumer-scale reliability; a small, known set of admin
 * accounts can retry or be granted access directly if delivery ever fails.
 */
export async function sendOtp(phone: string): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.functions.invoke("send-otp", {
      body: { phone },
    });
    if (error) {
      return { ok: false, error: await edgeFunctionError(error, "Could not send the code.") };
    }
    if (data?.ok !== true) {
      return { ok: false, error: data?.error ?? "Could not send the code." };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not send the code.",
    };
  }
}

export async function verifyOtpAndSignIn(
  phone: string,
  code: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.functions.invoke("verify-otp", {
      body: { phone, code },
    });
    if (error) {
      return { ok: false, error: await edgeFunctionError(error, "That code is not right.") };
    }
    if (data?.ok !== true || !data?.password) {
      return { ok: false, error: data?.error ?? "That code is not right." };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      phone,
      password: data.password as string,
    });
    if (signInError) throw signInError;

    const { data: isAdmin, error: adminCheckError } =
      await supabase.rpc("is_platform_admin");
    if (adminCheckError || !isAdmin) {
      await supabase.auth.signOut();
      return {
        ok: false,
        error: "This account does not have admin access to Groomto.",
      };
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Sign-in failed.",
    };
  }
}

/**
 * Email + password sign-in for a dedicated admin login (an email-only
 * Supabase user, created in the dashboard). Phone numbers deliberately can't
 * sign in this way: they belong to the shared Customer/Partner app logins,
 * whose password verify-otp manages — setting one would sign that number out
 * of both apps and be overwritten at its next OTP sign-in.
 * Same gate as the OTP path: not an admin → signed straight back out.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<ActionResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || !password) {
    return { ok: false, error: "Enter your admin email and password." };
  }

  const supabase = await createClient();
  try {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (signInError) {
      return {
        ok: false,
        error: /invalid login credentials/i.test(signInError.message)
          ? "Wrong email or password."
          : signInError.message,
      };
    }

    const { data: isAdmin, error: adminCheckError } =
      await supabase.rpc("is_platform_admin");
    if (adminCheckError || !isAdmin) {
      await supabase.auth.signOut();
      return {
        ok: false,
        error: "This account does not have admin access to Groomto.",
      };
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Sign-in failed.",
    };
  }
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

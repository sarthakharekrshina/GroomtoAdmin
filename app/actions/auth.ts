"use server";

import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  error?: string;
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
    if (error) throw error;
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
    if (error) throw error;
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

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

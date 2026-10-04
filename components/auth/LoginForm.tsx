"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendOtp, verifyOtpAndSignIn } from "@/app/actions/auth";

function toE164(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (input.trim().startsWith("+")) return `+${digits}`;
  // Same default country code as the Partner app (lib/utils/constants.dart).
  return `+91${digits}`;
}

export function LoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [isPending, startTransition] = useTransition();

  function handleSendOtp() {
    setError(null);
    const e164 = toE164(phoneInput);
    startTransition(async () => {
      const result = await sendOtp(e164);
      if (!result.ok) {
        setError(result.error ?? "Could not send the code.");
        return;
      }
      setPhone(e164);
      setStep("otp");
    });
  }

  function handleVerify() {
    setError(null);
    startTransition(async () => {
      const result = await verifyOtpAndSignIn(phone, code);
      if (!result.ok) {
        setError(result.error ?? "Sign-in failed.");
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
      <div className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold">
          Groomto
        </p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          AdminPartner
        </h1>
        <p className="mt-1 text-sm text-muted">
          Sign in with an admin phone number
        </p>
      </div>

      {step === "phone" ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Phone number
            </label>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            disabled={isPending || phoneInput.trim().length < 8}
            onClick={handleSendOtp}
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {isPending ? "Sending…" : "Send code"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Enter the code sent to <span className="font-medium">{phone}</span>
          </p>
          <input
            type="text"
            inputMode="numeric"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-center text-lg tracking-[0.3em] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            disabled={isPending || code.trim().length < 4}
            onClick={handleVerify}
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {isPending ? "Verifying…" : "Verify & sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setCode("");
              setError(null);
            }}
            className="w-full text-center text-xs text-muted hover:text-foreground"
          >
            Use a different number
          </button>
        </div>
      )}
    </div>
  );
}

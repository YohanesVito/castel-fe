"use client";

import { useEffect, useState } from "react";
import { api, type Session } from "@/lib/api";
import { setToken } from "@/lib/session";
import { PhoneInput } from "@/components/PhoneInput";

export function SignIn({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The free-tier backend can cold-start ~30-60s. Warm it while the user reads/types, and only
  // enable "Send code" once it responds — so the OTP request itself is instant. A 60s fallback
  // enables the button regardless, so a slow/undetectable warm-up never traps the user.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    let alive = true;
    const startedAt = Date.now();
    (async () => {
      while (alive) {
        if (await api.ping()) {
          if (alive) setWarm(true);
          return;
        }
        if (Date.now() - startedAt > 60_000) {
          if (alive) setWarm(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function sendCode() {
    const wa = phone.trim();
    if (!/^\+\d{8,15}$/.test(wa)) {
      setError("Enter your WhatsApp number (digits only — pick your country on the left).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.authRequest(wa);
      setStage("code");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.authVerify(phone.trim(), otp);
      setToken(session.token);
      onSignedIn(session);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="animate-rise">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold">
          {stage === "phone" ? "Welcome to Castel" : "Check WhatsApp"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {stage === "phone"
            ? "Your WhatsApp number is your account. No app, no bank, no seed phrase."
            : `We sent a 6-digit code to ${phone.trim()}.`}
        </p>

        {stage === "phone" ? (
          <>
            <div className="mt-6">
              <PhoneInput onChange={setPhone} onEnter={sendCode} autoFocus />
            </div>
            <button
              onClick={sendCode}
              disabled={busy || !warm}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-primary-end py-3.5 font-semibold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-60"
            >
              {!warm && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {busy
                ? "Sending…"
                : warm
                  ? "Send code on WhatsApp"
                  : "Waking the server…"}
            </button>
            {!warm && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                First load can take ~30s on our free demo server — you can type your number
                meanwhile.
              </p>
            )}
          </>
        ) : (
          <>
            <input
              inputMode="numeric"
              autoFocus
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && verify()}
              placeholder="000000"
              className="mt-6 w-full rounded-xl border border-border bg-background px-4 py-3 text-center font-[family-name:var(--font-mono)] text-2xl tracking-[0.4em] outline-none focus:border-primary"
            />
            <button
              onClick={verify}
              disabled={busy || otp.length !== 6}
              className="mt-4 w-full rounded-full bg-gradient-to-r from-primary to-primary-end py-3.5 font-semibold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Continue"}
            </button>
            <button
              onClick={() => {
                setStage("phone");
                setOtp("");
                setError(null);
              }}
              className="mt-2 w-full py-2 text-sm text-muted-foreground"
            >
              Use a different number
            </button>
          </>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </main>
  );
}

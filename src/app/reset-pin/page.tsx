"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PinPrompt } from "@/components/PinPrompt";
import { setToken } from "@/lib/session";

/**
 * Landing page for the single-use reset link the WhatsApp bot sends. The token in `?t=` is the
 * whole authorisation — the user is usually locked out of spending and may be on a device that
 * has never held a session, so nothing here assumes one.
 */
export default function ResetPinPage() {
  const [token, setTok] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setTok(new URLSearchParams(window.location.search).get("t"));
  }, []);

  async function submit(pin: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const session = await api.pinReset(token, pin);
      setToken(session.token);
      // Drop the token from the URL before anything can screenshot or share it. It is spent
      // server-side either way, but a dead credential shouldn't sit in history.
      window.history.replaceState({}, "", "/reset-pin");
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (token === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold">
          Open this from WhatsApp
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          To reset your PIN, send <span className="font-medium text-foreground">forgot pin</span> to
          the Castel bot on WhatsApp. It replies with a link that works once.
        </p>
        <Link href="/wallet" className="mt-6 font-medium text-primary">
          Go to wallet →
        </Link>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
        <div className="animate-rise">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-3xl text-success">
            ✓
          </div>
          <h1 className="mt-4 font-[family-name:var(--font-heading)] text-2xl font-bold">
            PIN updated
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your new PIN works right away, and the link you used is now dead. We&apos;ve messaged
            your WhatsApp to confirm the change.
          </p>
          <Link
            href="/wallet"
            className="mt-6 inline-block rounded-full bg-gradient-to-r from-primary to-primary-end px-6 py-3 font-semibold text-primary-foreground shadow-md"
          >
            Open my wallet
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="animate-rise">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold">
          Set a new PIN
        </h1>
        <p className="mt-2 text-muted-foreground">
          Choose six digits. This replaces your old PIN and unlocks spending again.
        </p>
      </div>
      <PinPrompt
        confirm
        mandatory
        title="New payment PIN"
        subtitle="Six digits. Don't reuse the PIN of a card or phone."
        busy={busy}
        error={error}
        onSubmit={submit}
        onCancel={() => {}}
      />
    </main>
  );
}

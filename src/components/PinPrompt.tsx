"use client";

import { useState } from "react";

type Props = {
  title: string;
  subtitle: string;
  confirm?: boolean;
  /** Onboarding: there is no wallet to go back to until the PIN exists, so no way out. */
  mandatory?: boolean;
  busy?: boolean;
  error?: string | null;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  onForgot?: () => void;
};

export function PinPrompt({
  title,
  subtitle,
  confirm,
  mandatory,
  busy,
  error,
  onSubmit,
  onCancel,
  onForgot,
}: Props) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const ready = confirm ? pin.length === 6 && again.length === 6 : pin.length === 6;

  function submit() {
    if (!ready || busy) return;
    if (confirm && pin !== again) {
      setMismatch(true);
      setAgain("");
      return;
    }
    onSubmit(pin);
  }

  const field = (value: string, set: (v: string) => void, label: string, autoFocus = false) => (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          setMismatch(false);
          set(e.target.value.replace(/\D/g, "").slice(0, 6));
        }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="••••••"
        className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-center font-[family-name:var(--font-mono)] text-2xl tracking-[0.4em] outline-none focus:border-primary"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center">
      <div className="animate-rise w-full max-w-md rounded-t-3xl border border-border bg-card p-6 shadow-xl sm:rounded-3xl">
        <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

        <div className="mt-5 space-y-3">
          {field(pin, setPin, confirm ? "Choose a 6-digit PIN" : "Enter your PIN", true)}
          {confirm && field(again, setAgain, "Confirm PIN")}
        </div>

        {mismatch && <p className="mt-3 text-sm text-destructive">PINs don&apos;t match</p>}
        {error && !mismatch && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <button
          onClick={submit}
          disabled={!ready || busy}
          className="mt-5 w-full rounded-full bg-gradient-to-r from-primary to-primary-end py-3.5 font-semibold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Please wait…" : confirm ? "Set PIN" : "Confirm"}
        </button>
        {!confirm && onForgot && (
          <button
            onClick={onForgot}
            disabled={busy}
            className="mt-3 w-full py-1 text-center text-sm font-medium text-primary underline underline-offset-2 disabled:opacity-50"
          >
            Forgot your PIN?
          </button>
        )}
        {!mandatory && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="mt-2 w-full py-2 text-sm text-muted-foreground"
          >
            Cancel
          </button>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Your PIN never travels through WhatsApp.
        </p>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PinPrompt } from "@/components/PinPrompt";
import { getToken } from "@/lib/session";
import { idr } from "@/lib/format";

export default function CashoutPage() {
  const [wa, setWa] = useState<string | null>(null);
  const [askPin, setAskPin] = useState(false);
  const [hasPin, setHasPin] = useState(true);
  const [amount, setAmount] = useState("500000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<{ amountIdr: number; qr: string; payload: string } | null>(null);

  useEffect(() => {
    setWa(getToken());
    api
      .me()
      .then((m) => setHasPin(m.hasPin))
      .catch(() => {});
  }, []);

  // Same as on the pay screen: recover the PIN over WhatsApp without losing this page.
  async function sendResetLink() {
    setBusy(true);
    setError(null);
    try {
      await api.pinResetLink();
      setError("Check WhatsApp — we sent you a link to set a new PIN.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function request(pin: string) {
    const amt = Number(amount);
    if (!amt) return;
    setBusy(true);
    setError(null);
    try {
      if (!hasPin) {
        await api.setPin(pin);
        setHasPin(true);
      }
      const res = await api.cashoutRequest(amt, pin);
      const payload = `castel:${res.escrowId}:${res.codeHex}`;
      const qr = await QRCode.toDataURL(payload, { margin: 1, width: 320 });
      setAskPin(false);
      setTicket({ amountIdr: res.amountIdr, qr, payload });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!wa) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
        <p className="text-muted-foreground">Open your wallet first.</p>
        <Link href="/wallet" className="mt-4 font-medium text-primary">
          Go to wallet →
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-24">
      <header className="sticky top-0 z-10 -mx-5 mb-4 border-b border-border/60 bg-background/70 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <Link href="/wallet" className="text-sm text-muted-foreground">
            ← Wallet
          </Link>
          <span className="font-[family-name:var(--font-heading)] font-bold">Withdraw cash</span>
        </div>
      </header>

      {!ticket ? (
        <div className="animate-rise">
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold">Get cash</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lock rupiah into escrow, then collect cash at any Castel agent.
          </p>
          <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <label className="text-sm text-muted-foreground">Amount (Rp)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-center font-[family-name:var(--font-mono)] text-2xl outline-none focus:border-primary"
            />
            {error && !askPin && <p className="mt-3 text-sm text-destructive">{error}</p>}
            <button
              onClick={() => {
                setError(null);
                setAskPin(true);
              }}
              disabled={busy || !Number(amount)}
              className="mt-5 w-full rounded-full bg-gradient-to-r from-primary to-primary-end py-3.5 font-semibold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "Locking in escrow…" : "Request cash"}
            </button>
          </div>

          {askPin && (
            <PinPrompt
              confirm={!hasPin}
              title={hasPin ? `Withdraw ${idr(Number(amount) || 0)}` : "Set your payment PIN"}
              subtitle={
                hasPin
                  ? "Enter your PIN to lock the funds in escrow for the agent."
                  : "First create a 6-digit PIN — you'll use it for this withdrawal and every payment."
              }
              busy={busy}
              error={error}
              onSubmit={request}
              onCancel={() => setAskPin(false)}
              onForgot={sendResetLink}
            />
          )}
        </div>
      ) : (
        <div className="animate-rise flex flex-col items-center text-center">
          <p className="text-sm text-muted-foreground">Show this to a Castel agent</p>
          <p className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-bold">
            {idr(ticket.amountIdr)}
          </p>
          <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ticket.qr} alt="Pickup code" className="h-64 w-64" />
          </div>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            The agent scans this and hands you the cash. Your rupiah is held safely in escrow until then.
          </p>
          <p className="mt-3 break-all rounded-lg bg-muted px-3 py-2 font-[family-name:var(--font-mono)] text-[10px] text-muted-foreground">
            {ticket.payload}
          </p>
          <Link href="/wallet" className="mt-6 text-sm text-primary">
            Back to wallet
          </Link>
        </div>
      )}
    </main>
  );
}

"use client";

import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, type Balances, type PayResult, type QrisInfo } from "@/lib/api";
import { PinPrompt } from "@/components/PinPrompt";
import { getToken } from "@/lib/session";
import { idr } from "@/lib/format";

const SAMPLE_QR =
  "00020101021253033605405850005802ID5916Warung Made Bali6004Bali6304ABCD";

type Stage = "scan" | "review" | "done";

export default function PayPage() {
  const [wa, setWa] = useState<string | null>(null);
  const [askPin, setAskPin] = useState(false);
  const [hasPin, setHasPin] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>("scan");
  const [payload, setPayload] = useState("");
  const [info, setInfo] = useState<QrisInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    merchant: string;
    amountIdr: number;
    balances: Balances;
    settlement: PayResult["settlement"];
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    setWa(getToken());
    api
      .balance()
      .then((b) => setBalance(Number(b.cIDR)))
      .catch(() => setBalance(null));
    api
      .me()
      .then((m) => setHasPin(m.hasPin))
      .catch(() => {});
  }, []);

  // Back from Stripe after a Quick Pay: the card cleared on Stripe's page, so the server
  // now swaps and pays the merchant, and we land straight on the receipt.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("quick");
    if (!q) return;
    const clean = () => window.history.replaceState({}, "", "/pay");
    if (q === "cancel") {
      setError("Payment cancelled");
      clean();
      return;
    }
    setConfirming(true);
    (async () => {
      try {
        const res = await api.quickPayConfirm(q);
        setReceipt({
          merchant: res.merchant,
          amountIdr: res.amountIdr,
          balances: res.balances,
          settlement: res.settlement,
        });
        setStage("done");
      } catch (e) {
        setError("Couldn't complete payment: " + (e as Error).message);
      } finally {
        setConfirming(false);
        clean();
      }
    })();
  }, []);

  // Leaving the scan stage (or unmounting) must release the camera.
  useEffect(() => {
    if (stage !== "scan") {
      controlsRef.current?.stop();
      controlsRef.current = null;
      setScanning(false);
    }
  }, [stage]);
  useEffect(() => () => controlsRef.current?.stop(), []);

  // Open the camera the moment the scan screen is shown — no tap needed where the browser
  // allows it. `wa` gates it so we don't prompt before the session is confirmed.
  useEffect(() => {
    if (wa && stage === "scan" && !confirming) startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wa, stage, confirming]);

  // Tries to open the camera as soon as the page loads. Some mobile browsers (iOS Safari)
  // only grant the camera on a user gesture, so if the auto-start is blocked we fall back
  // to a tap-to-start overlay rather than failing silently.
  async function startCamera() {
    if (controlsRef.current || !videoRef.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera needs a secure (https) connection — paste a code below");
      return;
    }
    setError(null);
    try {
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current,
        (result, _err, ctrl) => {
          if (result) {
            ctrl.stop();
            controlsRef.current = null;
            setScanning(false);
            handlePayload(result.getText());
          }
        },
      );
      controlsRef.current = controls;
      setScanning(true);
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name;
      setError(
        name === "NotAllowedError"
          ? "Camera permission denied — allow it in your browser settings, or paste a code below"
          : name === "NotFoundError"
            ? "No camera found — paste a code below"
            : "Camera unavailable — paste a code below",
      );
    }
  }

  async function handlePayload(p: string) {
    setBusy(true);
    setError(null);
    try {
      const decoded = await api.decodeQris(p);
      setPayload(p);
      setInfo(decoded);
      setAmount(decoded.amount ? String(decoded.amount) : "");
      setStage("review");
    } catch {
      setError("Couldn't read this QR code");
    } finally {
      setBusy(false);
    }
  }

  async function startQuickPay() {
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.quickPayCreate(payload, info.amount ?? Number(amount));
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function confirmPay(pin: string) {
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      // First-time payers set their PIN here rather than being sent away to /wallet,
      // which would drop the QR code they just scanned. The same prompt creates it.
      if (!hasPin) {
        await api.setPin(pin);
        setHasPin(true);
      }
      const res = await api.pay(payload, pin, info.amount ?? Number(amount));
      setReceipt({
        merchant: res.merchant,
        amountIdr: res.amountIdr,
        balances: res.balances,
        settlement: res.settlement,
      });
      setAskPin(false);
      setStage("done");
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

  if (confirming) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="mt-5 font-medium">Completing your payment…</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Converting to rupiah and paying the merchant.
        </p>
      </main>
    );
  }

  if (stage === "scan") {
    return (
      <main className="fixed inset-0 bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
        />

        {/* top bar */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
          <Link href="/wallet" className="text-sm font-medium text-white/90">
            ← Wallet
          </Link>
          <span className="font-[family-name:var(--font-heading)] font-bold text-white">Scan QRIS</span>
          <span className="w-12" />
        </div>

        {/* scan frame */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative aspect-square w-[68%] max-w-xs">
            <span className="absolute -left-1 -top-1 h-8 w-8 rounded-tl-xl border-l-4 border-t-4 border-white" />
            <span className="absolute -right-1 -top-1 h-8 w-8 rounded-tr-xl border-r-4 border-t-4 border-white" />
            <span className="absolute -bottom-1 -left-1 h-8 w-8 rounded-bl-xl border-b-4 border-l-4 border-white" />
            <span className="absolute -bottom-1 -right-1 h-8 w-8 rounded-br-xl border-b-4 border-r-4 border-white" />
          </div>
        </div>

        {/* camera not running yet — permission needed / blocked */}
        {!scanning && (
          <button
            onClick={startCamera}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/50 text-white"
          >
            <span className="text-5xl">📷</span>
            <span className="text-sm font-medium">Tap to start camera</span>
          </button>
        )}

        {/* bottom sheet: manual entry + sample */}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10">
          <p className="text-center text-xs text-white/70">Point at a merchant&apos;s QRIS code</p>
          {error && <p className="mt-2 text-center text-sm text-red-300">{error}</p>}
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              onClick={() => setManual((v) => !v)}
              className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur"
            >
              Enter code
            </button>
            <button
              onClick={() => handlePayload(SAMPLE_QR)}
              className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur"
            >
              Use sample
            </button>
          </div>
          {manual && (
            <div className="mt-3 rounded-2xl bg-white p-3">
              <textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                rows={2}
                placeholder="00020101..."
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-[family-name:var(--font-mono)] text-xs outline-none focus:border-primary"
              />
              <button
                onClick={() => handlePayload(payload)}
                disabled={!payload || busy}
                className="mt-2 w-full rounded-full bg-foreground py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {busy ? "Reading…" : "Read code"}
              </button>
            </div>
          )}
        </div>
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
          <span className="font-[family-name:var(--font-heading)] font-bold">Pay</span>
        </div>
      </header>

      {stage === "review" && info && (() => {
        const due = info.amount ?? (Number(amount) || 0);
        const short = balance !== null && due > 0 && balance < due;
        return (
        <div className="animate-rise">
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">Paying</p>
            <p className="mt-1 font-[family-name:var(--font-heading)] text-xl font-bold">
              {info.merchantName}
            </p>
            {info.city && <p className="text-xs text-muted-foreground">{info.city}</p>}

            {info.isStatic ? (
              <div className="mt-5 text-left">
                <label className="text-sm text-muted-foreground">Amount (Rp)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-center font-[family-name:var(--font-mono)] text-2xl outline-none focus:border-primary"
                />
              </div>
            ) : (
              <p className="mt-5 font-[family-name:var(--font-mono)] text-4xl font-bold">
                {idr(info.amount!)}
              </p>
            )}
          </div>

          {error && <p className="mt-3 text-center text-sm text-destructive">{error}</p>}

          {short && (
            <div className="mt-5 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-center">
              <p className="text-sm font-semibold">Not enough balance</p>
              <p className="mt-1 text-xs text-muted-foreground">
                You have {idr(balance ?? 0)} — pay with your card instead, no top-up needed.
              </p>
            </div>
          )}

          {/* Balance is the cheap path when it covers the bill; Quick Pay charges the card
              for just this payment when it doesn't (or when the tourist would rather not prefund). */}
          {!short && (
            <button
              onClick={() => {
                setError(null);
                setAskPin(true);
              }}
              disabled={busy || (info.isStatic && !Number(amount))}
              className="mt-5 w-full rounded-full bg-gradient-to-r from-primary to-primary-end py-3.5 font-semibold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "Paying…" : `Pay ${idr(due)} from balance`}
            </button>
          )}

          <button
            onClick={startQuickPay}
            disabled={busy || (info.isStatic && !Number(amount))}
            className={
              short
                ? "mt-3 w-full rounded-full bg-gradient-to-r from-primary to-primary-end py-3.5 font-semibold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-50"
                : "mt-3 w-full rounded-full border-2 border-primary py-3 font-semibold text-primary transition active:scale-[0.98] disabled:opacity-50"
            }
          >
            {busy ? "…" : `Quick pay ${idr(due)} with card →`}
          </button>
          {!short && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              No balance needed — your card is charged for this payment.
            </p>
          )}

          {askPin && (
            <PinPrompt
              confirm={!hasPin}
              title={hasPin ? `Pay ${idr(due)}` : "Set your payment PIN"}
              subtitle={
                hasPin
                  ? `To ${info.merchantName}. Enter your PIN to authorise.`
                  : `First create a 6-digit PIN — you'll use it to pay ${idr(due)} to ${info.merchantName} and every payment after.`
              }
              busy={busy}
              error={error}
              onSubmit={confirmPay}
              onCancel={() => setAskPin(false)}
            />
          )}
          <button
            onClick={() => {
              setStage("scan");
              setError(null);
            }}
            className="mt-3 w-full py-2 text-sm text-muted-foreground"
          >
            Cancel
          </button>
        </div>
        );
      })()}

      {stage === "done" && receipt && (
        <div className="animate-rise flex flex-col items-center pt-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-3xl text-success">
            ✓
          </div>
          <p className="mt-4 font-[family-name:var(--font-heading)] text-2xl font-bold">Paid</p>
          <p className="mt-1 text-muted-foreground">
            {idr(receipt.amountIdr)} to {receipt.merchant}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Merchant received Indonesian rupiah.</p>

          <div className="mt-6 w-full rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Balance left</span>
              <span className="font-[family-name:var(--font-mono)] font-bold">
                {idr(Number(receipt.balances.cIDR))}
              </span>
            </div>
            {receipt.settlement && "id" in receipt.settlement && (
              <div className="mt-3 border-t border-border pt-3 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Merchant settlement</span>
                  <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                    {receipt.settlement.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  IDR sent via Xendit · {receipt.settlement.channel} ·{" "}
                  <span className="font-[family-name:var(--font-mono)]">
                    {receipt.settlement.id.slice(0, 12)}…
                  </span>
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setReceipt(null);
              setInfo(null);
              setPayload("");
              setStage("scan");
            }}
            className="mt-6 w-full rounded-full border border-border py-3 font-medium"
          >
            Pay again
          </button>
          <Link href="/wallet" className="mt-3 text-sm text-primary">
            Back to wallet
          </Link>
        </div>
      )}
    </main>
  );
}

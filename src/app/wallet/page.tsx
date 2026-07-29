"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Balances, type Limits, type Quote, type Tx } from "@/lib/api";
import { clearSession, getToken, setToken, takeLinkToken } from "@/lib/session";
import { PinPrompt } from "@/components/PinPrompt";
import { SignIn } from "@/components/SignIn";
import { idr } from "@/lib/format";

const EXPLORER = "https://stellar.expert/explorer/testnet/tx/";

const toNum = (s: string) => Number(s);

export default function WalletPage() {
  const [waNumber, setWaNumber] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(true);
  const [ready, setReady] = useState(false);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [history, setHistory] = useState<Tx[]>([]);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [amount, setAmount] = useState("200");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depMode, setDepMode] = useState<"card" | "usdc">("card");
  const [depAmt, setDepAmt] = useState("200");
  const [depQuote, setDepQuote] = useState<Quote | null>(null);
  const [wal, setWal] = useState<Awaited<ReturnType<typeof api.wallet>> | null>(null);
  const [usdcQr, setUsdcQr] = useState<string | null>(null);
  const [askPin, setAskPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ m: string; ok: boolean } | null>(null);

  // Either we arrived from a WhatsApp magic link, or we already hold a session.
  useEffect(() => {
    (async () => {
      const link = takeLinkToken();
      try {
        if (link) {
          const s = await api.authExchange(link);
          setToken(s.token);
          const url = new URL(window.location.href);
          url.searchParams.delete("t");
          window.history.replaceState({}, "", url.pathname + url.search);
          setWaNumber(s.waNumber ?? null);
          setHasPin(s.hasPin);
        } else if (getToken()) {
          const me = await api.me();
          setWaNumber(me.waNumber);
          setHasPin(me.hasPin);
        }
      } catch {
        clearSession();
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [bal, hist, lim] = await Promise.all([api.balance(), api.history(), api.limits()]);
      setBalances(bal);
      setHistory(hist);
      setLimits(lim);
    } catch {
      setBalances({ cIDR: "0", USDC: "0" });
    }
  }, []);

  useEffect(() => {
    if (waNumber) refresh();
  }, [waNumber, refresh]);

  useEffect(() => {
    const usdc = Number(amount);
    const t = setTimeout(async () => {
      if (!usdc || usdc <= 0) {
        setQuote(null);
        return;
      }
      try {
        setQuote(await api.quote(usdc));
      } catch {
        setQuote(null);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [amount]);

  useEffect(() => {
    const usd = Number(depAmt);
    const t = setTimeout(async () => {
      if (!usd || usd <= 0) {
        setDepQuote(null);
        return;
      }
      try {
        setDepQuote(await api.quote(usd));
      } catch {
        setDepQuote(null);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [depAmt]);

  const flash = (m: string, ok = true) => {
    setToast({ m, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // Back from Stripe Checkout: confirm the session, then credit is verified server-side.
  // Waits for `ready` — confirming needs the session token we may still be exchanging for.
  useEffect(() => {
    if (!ready || !waNumber) return;
    const dep = new URLSearchParams(window.location.search).get("deposit");
    if (!dep) return;
    const cleanUrl = () => window.history.replaceState({}, "", "/wallet");
    if (dep === "cancel") {
      flash("Deposit cancelled", false);
      cleanUrl();
      return;
    }
    (async () => {
      setBusy(true);
      try {
        const res = await api.depositConfirm(dep);
        setBalances(res.balances);
        flash(
          res.cidr
            ? `${idr(res.cidr)} added — ${idr(res.savingsIdr ?? 0)} more than a money changer`
            : `$${res.usd} added — exchange pending`,
          !res.exchangeFailed,
        );
        refresh();
      } catch (e) {
        flash("Couldn't confirm deposit: " + (e as Error).message, false);
      } finally {
        setBusy(false);
        cleanUrl();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, waNumber]);

  // Opened from the WhatsApp "topup" link — jump straight to the deposit panel.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("topup")) setShowDeposit(true);
  }, []);

  // The deposit sheet needs the wallet address + whether a card is on file.
  useEffect(() => {
    if (!showDeposit || wal || !waNumber) return;
    api.wallet().then(setWal).catch(() => {});
  }, [showDeposit, wal, waNumber]);

  // A QR of the Stellar address, for the USDC on-ramp.
  useEffect(() => {
    if (depMode !== "usdc" || !wal || usdcQr) return;
    QRCode.toDataURL(wal.publicKey, { margin: 1, width: 240 })
      .then(setUsdcQr)
      .catch(() => {});
  }, [depMode, wal, usdcQr]);

  async function topup() {
    setBusy(true);
    try {
      await api.fund(200);
      await refresh();
      flash("Topped up 200 USDC");
    } catch (e) {
      flash("Top-up failed: " + (e as Error).message, false);
    } finally {
      setBusy(false);
    }
  }

  async function startDeposit() {
    const usd = Number(depAmt);
    if (!usd || usd <= 0) {
      flash("Enter an amount", false);
      return;
    }
    setBusy(true);
    try {
      const { url } = await api.depositCreate(usd);
      window.location.href = url;
    } catch (e) {
      flash("Couldn't start deposit: " + (e as Error).message, false);
      setBusy(false);
    }
  }

  // One-tap top-up on the saved card. If Stripe wants the card re-entered (e.g. it now
  // needs authentication), fall back to the Checkout redirect.
  async function chargeSaved() {
    const usd = Number(depAmt);
    if (!usd || usd <= 0) {
      flash("Enter an amount", false);
      return;
    }
    setBusy(true);
    try {
      const res = await api.depositCharge(usd);
      setBalances(res.balances);
      flash(
        res.cidr
          ? `${idr(res.cidr)} added — ${idr(res.savingsIdr ?? 0)} more than a money changer`
          : `$${res.usd} added — exchange pending`,
        !res.exchangeFailed,
      );
      setShowDeposit(false);
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        await startDeposit();
        return;
      }
      flash("Top-up failed: " + (e as Error).message, false);
    } finally {
      setBusy(false);
    }
  }

  async function convertUsdc() {
    setBusy(true);
    try {
      const res = await api.depositUsdcConvert();
      setBalances(res.balances);
      flash(`${idr(res.cidr)} added — ${idr(res.savingsIdr)} more than a money changer`);
      setShowDeposit(false);
      refresh();
    } catch (e) {
      flash((e as Error).message, false);
    } finally {
      setBusy(false);
    }
  }

  async function swap() {
    const usdc = Number(amount);
    if (!usdc || usdc > toNum(balances?.USDC ?? "0")) {
      flash("Not enough USDC — top up first", false);
      return;
    }
    setBusy(true);
    try {
      const res = await api.swap(usdc);
      setBalances(res.balances);
      flash(`Exchanged! You saved ${idr(res.quote.savingsIdr)}`);
      refresh();
    } catch (e) {
      flash("Exchange failed: " + (e as Error).message, false);
    } finally {
      setBusy(false);
    }
  }

  async function createPin(pin: string) {
    setBusy(true);
    setPinError(null);
    try {
      await api.setPin(pin);
      setHasPin(true);
      setAskPin(false);
      flash("PIN set — you can now pay and cash out");
    } catch (e) {
      setPinError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
      </main>
    );
  }

  if (!waNumber) {
    return (
      <SignIn
        onSignedIn={(s) => {
          setWaNumber(s.waNumber ?? null);
          setHasPin(s.hasPin);
        }}
      />
    );
  }

  const cidr = toNum(balances?.cIDR ?? "0");
  const usdc = toNum(balances?.USDC ?? "0");

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-24">
      <header className="sticky top-0 z-10 -mx-5 mb-2 border-b border-border/60 bg-background/70 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="font-[family-name:var(--font-heading)] text-xl font-bold">Castel</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{waNumber}</span>
            <button
              onClick={() => {
                clearSession();
                setWaNumber(null);
                setBalances(null);
                setHistory([]);
                setLimits(null);
                setHasPin(true);
              }}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium transition active:scale-95"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {!hasPin && (
        <button
          onClick={() => {
            setPinError(null);
            setAskPin(true);
          }}
          className="animate-rise mt-2 flex w-full items-center gap-3 rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3 text-left"
        >
          <span className="text-lg">🔒</span>
          <span className="flex-1">
            <span className="block text-sm font-semibold">Set your payment PIN</span>
            <span className="block text-xs text-muted-foreground">
              Required before you can pay or cash out.
            </span>
          </span>
          <span className="text-muted-foreground">›</span>
        </button>
      )}

      {askPin && (
        <PinPrompt
          confirm
          title="Create your PIN"
          subtitle="Six digits. You'll enter it every time you spend — even if someone else gets into your WhatsApp."
          busy={busy}
          error={pinError}
          onSubmit={createPin}
          onCancel={() => setAskPin(false)}
        />
      )}

      <section className="animate-rise mt-2 rounded-2xl bg-gradient-to-br from-primary to-primary-end p-6 text-primary-foreground shadow-lg">
        <p className="text-sm opacity-80">Your balance</p>
        {balances === null ? (
          <>
            <div className="mt-2 h-9 w-44 animate-pulse rounded-lg bg-white/25" />
            <div className="mt-3 h-4 w-28 animate-pulse rounded bg-white/20" />
          </>
        ) : (
          <>
            <p className="mt-1 font-[family-name:var(--font-mono)] text-4xl font-bold tracking-tight">
              {idr(cidr)}
            </p>
            {usdc > 0 && (
              <p className="mt-3 text-sm opacity-80">
                <span className="font-[family-name:var(--font-mono)]">{usdc.toFixed(2)}</span> USDC
                waiting to be exchanged
              </p>
            )}
          </>
        )}
        <div className="mt-4">
          {!showDeposit ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDeposit(true)}
                disabled={busy}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary shadow transition active:scale-95 disabled:opacity-50"
              >
                + Add money
              </button>
              <button
                onClick={topup}
                disabled={busy}
                className="text-xs text-white/70 underline underline-offset-2 transition active:scale-95 disabled:opacity-50"
              >
                instant demo
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
              <div className="mb-3 flex rounded-full bg-white/15 p-0.5 text-xs font-medium">
                {(["card", "usdc"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setDepMode(m)}
                    className={`flex-1 rounded-full py-1.5 transition ${
                      depMode === m ? "bg-white text-primary shadow" : "text-white/80"
                    }`}
                  >
                    {m === "card" ? "💳 Card" : "⭐ USDC"}
                  </button>
                ))}
              </div>

              {depMode === "card" ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-[family-name:var(--font-mono)] text-lg">$</span>
                    <input
                      type="number"
                      value={depAmt}
                      onChange={(e) => setDepAmt(e.target.value)}
                      className="w-full min-w-0 rounded-lg bg-white/90 px-3 py-2 font-[family-name:var(--font-mono)] text-lg text-foreground outline-none"
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    {[50, 100, 200].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setDepAmt(String(v))}
                        className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium transition active:scale-95"
                      >
                        ${v}
                      </button>
                    ))}
                  </div>
                  {depQuote && (
                    <div className="mt-3 rounded-lg bg-white/20 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="opacity-80">You get</span>
                        <span className="font-[family-name:var(--font-mono)] font-bold">
                          {idr(depQuote.cidrOut)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs opacity-80">
                        <span>vs money changer (est.)</span>
                        <span className="font-[family-name:var(--font-mono)]">
                          {depQuote.savingsIdr >= 0 ? "+" : ""}
                          {idr(depQuote.savingsIdr)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] opacity-60">
                        Market rate {depQuote.midRate.toFixed(0)}/USD
                        {depQuote.midSource === "live" ? " · live" : " · last known"}
                      </p>
                    </div>
                  )}
                  {wal?.hasSavedCard ? (
                    <>
                      <button
                        onClick={chargeSaved}
                        disabled={busy}
                        className="mt-3 w-full rounded-full bg-white py-2.5 text-sm font-semibold text-primary shadow transition active:scale-[0.98] disabled:opacity-50"
                      >
                        {busy ? "Charging…" : `Pay with card •••• ${wal.cardLast4}`}
                      </button>
                      <button
                        onClick={startDeposit}
                        disabled={busy}
                        className="mt-2 w-full py-1 text-center text-[11px] text-white/70 underline underline-offset-2 disabled:opacity-50"
                      >
                        Use a different card
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={startDeposit}
                        disabled={busy}
                        className="mt-3 w-full rounded-full bg-white py-2.5 text-sm font-semibold text-primary shadow transition active:scale-[0.98] disabled:opacity-50"
                      >
                        {busy ? "Redirecting…" : "Top up with card →"}
                      </button>
                      <p className="mt-2 text-center text-[11px] text-white/70">
                        Test card 4242 4242 4242 4242 · any future date · any CVC
                      </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-white/80">
                    Already hold USDC? Send Stellar USDC to your Castel address and it converts to
                    rupiah.
                  </p>
                  {usdcQr && (
                    <div className="mx-auto mt-3 w-fit rounded-xl bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={usdcQr} alt="Your Stellar address" className="h-32 w-32" />
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (wal) {
                        navigator.clipboard?.writeText(wal.publicKey);
                        flash("Address copied");
                      }
                    }}
                    className="mt-3 w-full break-all rounded-lg bg-white/20 px-3 py-2 text-left font-[family-name:var(--font-mono)] text-[11px] transition active:scale-[0.99]"
                  >
                    {wal?.publicKey ?? "…"}
                    <span className="ml-1 opacity-70">· tap to copy</span>
                  </button>
                  <p className="mt-2 text-[11px] text-white/60">
                    Asset: USDC · issuer {wal ? `${wal.usdc.issuer.slice(0, 6)}…` : "…"}
                  </p>
                  <button
                    onClick={convertUsdc}
                    disabled={busy}
                    className="mt-3 w-full rounded-full bg-white py-2.5 text-sm font-semibold text-primary shadow transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {busy ? "Converting…" : "I've sent USDC — convert to rupiah"}
                  </button>
                  <button
                    onClick={topup}
                    disabled={busy}
                    className="mt-2 w-full py-1 text-center text-[11px] text-white/70 underline underline-offset-2 disabled:opacity-50"
                  >
                    Testnet: get 200 test USDC to try this
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="animate-rise mt-4 grid grid-cols-2 gap-3">
        <Link
          href="/pay"
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-4 font-semibold shadow-sm transition active:scale-[0.99]"
        >
          <span>📷</span> Pay QRIS
        </Link>
        <Link
          href="/cashout"
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-4 font-semibold shadow-sm transition active:scale-[0.99]"
        >
          <span>💵</span> Get cash
        </Link>
      </div>

      {usdc > 0 && (
      <section className="animate-rise mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">Exchange to rupiah</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your card top-up didn&apos;t finish converting. Exchange it here.
        </p>

        <label className="mt-4 block text-sm text-muted-foreground">USDC amount</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 font-[family-name:var(--font-mono)] text-lg outline-none focus:border-primary"
        />
        <div className="mt-2 flex gap-2">
          {[50, 100, 200].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(String(v))}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition active:scale-95"
            >
              ${v}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAmount(String(Math.floor(usdc)))}
            disabled={!usdc}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition active:scale-95 disabled:opacity-40"
          >
            Max
          </button>
        </div>

        {quote && (
          <div className="mt-4 space-y-3 rounded-xl bg-muted/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">You receive</span>
              <span className="font-[family-name:var(--font-mono)] text-lg font-bold">
                {idr(quote.cidrOut)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Castel rate</span>
              <span className="font-[family-name:var(--font-mono)]">{quote.rate.toFixed(0)} /USD</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Market rate {quote.midSource === "live" ? "· live" : "· last known"}
              </span>
              <span className="font-[family-name:var(--font-mono)]">
                {quote.midRate.toFixed(0)} /USD
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Money changer (est.)</span>
              <span className="font-[family-name:var(--font-mono)] text-muted-foreground line-through">
                {idr(quote.changerCidr)}
              </span>
            </div>
            <div
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                quote.savingsIdr >= 0 ? "bg-success-soft" : "bg-muted"
              }`}
            >
              <span
                className={`text-sm font-medium ${
                  quote.savingsIdr >= 0 ? "text-success" : "text-muted-foreground"
                }`}
              >
                {quote.savingsIdr >= 0 ? "💰 You save" : "Difference"}
              </span>
              <span
                className={`font-[family-name:var(--font-mono)] font-bold ${
                  quote.savingsIdr >= 0 ? "text-success" : "text-muted-foreground"
                }`}
              >
                {idr(quote.savingsIdr)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Money-changer figure is an estimate: market rate minus a typical Rp 200/USD
              markdown.
            </p>
          </div>
        )}

        <button
          onClick={swap}
          disabled={busy || !quote}
          className="mt-5 w-full rounded-full bg-gradient-to-r from-primary to-primary-end py-3.5 font-semibold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Processing…" : "Exchange now"}
        </button>
      </section>
      )}

      {limits && (
        <section className="animate-rise mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Tier {limits.tier} · {limits.tierName}
            </span>
            <span className="text-xs text-muted-foreground">{limits.windowDays}-day limit</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${Math.min(100, (limits.spentIdr / limits.spendCapIdr) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {idr(limits.spentIdr)} of {idr(limits.spendCapIdr)} spent · verify your passport to
            raise it
          </p>
        </section>
      )}

      {history.length > 0 && (
        <section className="animate-rise mt-6">
          <h2 className="px-1 font-[family-name:var(--font-heading)] text-sm font-semibold text-muted-foreground">
            Recent activity
          </h2>
          <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {history.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm ${
                    tx.direction === "in" ? "bg-success-soft text-success" : "bg-muted text-foreground"
                  }`}
                >
                  {tx.type === "swap"
                    ? "⇄"
                    : tx.type === "pay"
                      ? "↑"
                      : tx.type === "deposit"
                        ? "＋"
                        : "↓"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tx.title}</p>
                  {tx.hash && /^[a-f0-9]{64}$/i.test(tx.hash) && (
                    <a
                      href={EXPLORER + tx.hash}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary"
                    >
                      View on-chain ↗
                    </a>
                  )}
                </div>
                <span
                  className={`shrink-0 font-[family-name:var(--font-mono)] text-sm font-semibold ${
                    tx.direction === "in" ? "text-success" : "text-foreground"
                  }`}
                >
                  {tx.direction === "in" ? "+" : "−"}
                  {idr(tx.amountIdr)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {toast && (
        <div
          className={`animate-rise fixed inset-x-0 bottom-6 mx-auto w-fit max-w-[90%] rounded-full px-5 py-3 text-center text-sm shadow-xl ${
            toast.ok ? "bg-foreground text-background" : "bg-destructive text-white"
          }`}
        >
          {toast.m}
        </div>
      )}
    </main>
  );
}

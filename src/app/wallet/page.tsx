"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Balances, type Limits, type Quote, type Tx } from "@/lib/api";
import { clearSession, getToken, setToken, takeLinkToken } from "@/lib/session";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PinPrompt } from "@/components/PinPrompt";
import { SignIn } from "@/components/SignIn";
import { idr } from "@/lib/format";
import {
  addTrustline,
  connectWallet,
  disconnectWallet,
  nativeBalance,
  onTestnet,
  restoreWallet,
  sendUsdc,
  sendXlm,
  usdcBalance,
  walletNetworkPassphrase,
} from "@/lib/stellar-wallet";

const EXPLORER = "https://stellar.expert/explorer/testnet/tx/";

const toNum = (s: string) => Number(s);

const isStellarHash = (h?: string) => !!h && /^[a-f0-9]{64}$/i.test(h);

// The outcome of a top-up, shown as a card under "Add money" instead of a toast — a deposit is
// the one moment a user needs a receipt they can read, and a 3.5s toast is routinely missed.
// Every rail (card, saved card, Circle USDC, XLM, manual USDC, testnet faucet) reports here.
type DepositOutcome = {
  status: "success" | "pending" | "info" | "error";
  method: string;
  title?: string;
  cidr?: number;
  paid?: string;
  savingsIdr?: number;
  hash?: string;
  note?: string;
};

const OUTCOME_TITLE: Record<DepositOutcome["status"], string> = {
  success: "Money added",
  pending: "Top-up in progress",
  info: "Top-up update",
  error: "Top-up failed",
};

// Wallet extensions throw terse, uneven errors; map the common ones to something a tester reads.
function walletErr(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  if (/reject|denied|declin|cancel/i.test(m)) return "Cancelled in wallet";
  if (/not.*install|no wallet|unavailable/i.test(m)) return "No wallet found — install Freighter";
  // Horizon 404s when the account doesn't exist on-chain yet (never funded).
  if (/not found|404|does not exist|resource missing/i.test(m))
    return "This wallet isn't funded on testnet yet — use Friendbot in Freighter first";
  if (/op_no_trust|no_trust/i.test(m)) return "Your wallet has no USDC trustline yet";
  if (/op_underfunded|underfunded/i.test(m)) return "Not enough balance in your wallet";
  return m;
}

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
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [circle, setCircle] = useState<{ castel: string; issuer: string } | null>(null);
  const [walBal, setWalBal] = useState<number | null>(null); // USDC in the connected wallet; null = no trustline
  const [xlmBal, setXlmBal] = useState<number | null>(null); // native XLM in the connected wallet
  const [cryptoAsset, setCryptoAsset] = useState<"xlm" | "usdc">("xlm");
  // A crypto deposit whose on-chain send succeeded but whose convert didn't finish — persisted
  // so the user can retry the CONVERT only (never re-send and double-deposit).
  const [pending, setPending] = useState<{ asset: "xlm" | "usdc"; hash?: string } | null>(null);
  const [netOk, setNetOk] = useState(true);
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ m: string; ok: boolean } | null>(null);
  const [depResult, setDepResult] = useState<DepositOutcome | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  // Idempotency key for the saved-card charge; stable across retries, reset on a new amount.
  const chargeKeyRef = useRef("");
  // Stripe session ids already confirmed this mount, so the confirm effect never double-fires.
  const confirmedRef = useRef<Set<string>>(new Set());

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
      // A transient fetch failure (cold backend, blip) must not wipe a balance we already have —
      // that reads as "my deposit vanished". Only show Rp 0 on the very first load.
      setBalances((b) => b ?? { cIDR: "0", USDC: "0" });
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
    // A new amount is a new charge intent, so a retry of the previous one can't dedup against it.
    chargeKeyRef.current = "";
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

  // The result card lives at the top of the page; the crypto sheet is tall enough that finishing
  // a deposit can leave the user scrolled past it.
  const report = (o: DepositOutcome) => {
    setDepResult(o);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Both card rails return the same shape. `credited: false` means the hash was already
  // reserved — a replayed confirm — so nothing was added and it must not read as a top-up.
  const reportCard = (
    res: { credited: boolean; usd: number; cidr?: number; savingsIdr?: number },
    method: string,
  ) =>
    report(
      res.credited
        ? {
            status: "success",
            method,
            cidr: res.cidr,
            paid: `$${res.usd}`,
            savingsIdr: res.savingsIdr,
          }
        : {
            status: "info",
            method,
            title: "Already added",
            note: "This payment was already credited to your balance — you have not been charged twice.",
          },
    );

  const PENDING_KEY = "castel-pending-convert";
  const savePending = (p: { asset: "xlm" | "usdc"; hash?: string } | null) => {
    setPending(p);
    try {
      if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
      else localStorage.removeItem(PENDING_KEY);
    } catch {}
  };
  // Recover a crypto deposit whose convert didn't finish on a previous visit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { asset: "xlm" | "usdc"; hash?: string };
        setPending(p);
        setCryptoAsset(p.asset);
        setDepMode("usdc");
      }
    } catch {}
  }, []);

  // Back from Stripe Checkout: confirm the session, then credit is verified server-side.
  // Waits for `ready` — confirming needs the session token we may still be exchanging for.
  useEffect(() => {
    if (!ready || !waNumber) return;
    const dep = new URLSearchParams(window.location.search).get("deposit");
    if (!dep) return;
    // Confirm each session id at most once (Strict Mode / re-mount can fire this effect twice
    // before the URL is cleaned; the backend is idempotent, but don't double-request).
    if (confirmedRef.current.has(dep)) return;
    confirmedRef.current.add(dep);
    const cleanUrl = () => window.history.replaceState({}, "", "/wallet");
    if (dep === "cancel") {
      report({
        status: "info",
        method: "Card",
        title: "Top-up cancelled",
        note: "You weren't charged. Tap Add money to try again.",
      });
      cleanUrl();
      return;
    }
    (async () => {
      setBusy(true);
      try {
        const res = await api.depositConfirm(dep);
        setBalances(res.balances);
        reportCard(res, "Card");
        refresh();
      } catch (e) {
        report({
          status: "error",
          method: "Card",
          note: "Couldn't confirm your top-up: " + (e as Error).message,
        });
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
    setDepResult(null);
    try {
      await api.fund(200);
      await refresh();
      report({
        status: "info",
        method: "Testnet",
        title: "Test USDC added",
        paid: "200 USDC",
        note: "200 test USDC is now in your Castel wallet. Convert it to rupiah to finish the top-up.",
      });
    } catch (e) {
      report({ status: "error", method: "Testnet", note: (e as Error).message });
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
    setDepResult(null);
    try {
      const { url } = await api.depositCreate(usd);
      window.location.href = url;
    } catch (e) {
      report({
        status: "error",
        method: "Card",
        note: "Couldn't start the top-up: " + (e as Error).message,
      });
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
    setDepResult(null);
    // Reuse one key across retries of the same charge so a timed-out charge can't double-bill;
    // cleared on a new amount (effect below) and on success.
    if (!chargeKeyRef.current) chargeKeyRef.current = crypto.randomUUID();
    try {
      const res = await api.depositCharge(usd, chargeKeyRef.current);
      chargeKeyRef.current = "";
      setBalances(res.balances);
      setShowDeposit(false);
      reportCard(res, `Card •••• ${wal?.cardLast4 ?? ""}`.trim());
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        chargeKeyRef.current = "";
        await startDeposit();
        return;
      }
      report({ status: "error", method: "Card", note: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function convertUsdc() {
    setBusy(true);
    setDepResult(null);
    try {
      const res = await api.depositUsdcConvert();
      setBalances(res.balances);
      setShowDeposit(false);
      report({
        status: "success",
        method: "USDC",
        cidr: res.cidr,
        paid: `${res.usdc} USDC`,
        savingsIdr: res.savingsIdr,
      });
      refresh();
    } catch (e) {
      report({ status: "error", method: "USDC", note: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  // Crypto on-ramp: connect a Stellar wallet, then send real Circle USDC straight from it.
  // Load balances + Circle setup for a connected address. The Stellar Wallets Kit persists the
  // connection itself (activeAddress in localStorage), so we don't store it — this just hydrates
  // the UI. Read-only (no extension calls), so it's silent.
  async function afterConnect(addr: string) {
    setWalletAddr(addr);
    // XLM needs no Circle setup — fetch it first so a failed prepare can't disable the XLM tab.
    setXlmBal(await nativeBalance(addr));
    try {
      const prep = await api.depositCirclePrepare(); // trustlines the Castel address + returns the issuer
      setCircle({ castel: prep.publicKey, issuer: prep.asset.issuer });
      setWalBal(await usdcBalance(addr, prep.asset.issuer));
    } catch {}
  }

  async function connect() {
    setBusy(true);
    try {
      const addr = await connectWallet();
      setNetOk(onTestnet(await walletNetworkPassphrase()));
      await afterConnect(addr);
    } catch (e) {
      flash(walletErr(e), false);
    } finally {
      setBusy(false);
    }
  }

  // Restore a previously-connected wallet on load via the Kit's own persistence, so the user isn't
  // asked to connect every visit (getAddress returns the remembered address without a modal).
  useEffect(() => {
    if (!waNumber || walletAddr) return;
    restoreWallet().then((addr) => {
      if (addr) afterConnect(addr).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waNumber]);

  // Re-read the connected wallet's balances (e.g. after the user funds it with Friendbot). Also
  // retries the Circle prepare if it failed at connect, so the USDC tab can recover.
  async function reloadBalances() {
    if (!walletAddr) return;
    setXlmBal(await nativeBalance(walletAddr));
    let issuer = circle?.issuer;
    if (!issuer) {
      try {
        const prep = await api.depositCirclePrepare();
        setCircle({ castel: prep.publicKey, issuer: prep.asset.issuer });
        issuer = prep.asset.issuer;
      } catch {}
    }
    if (issuer) setWalBal(await usdcBalance(walletAddr, issuer));
  }

  async function disconnect() {
    try {
      await disconnectWallet(); // clears the Kit's persisted activeAddress too
    } catch {}
    setWalletAddr(null);
    setCircle(null);
    setWalBal(null);
    setXlmBal(null);
    setNetOk(true);
  }

  async function trustWallet() {
    if (!walletAddr || !circle) return;
    setBusy(true);
    try {
      await addTrustline(walletAddr, circle.issuer);
      setWalBal(await usdcBalance(walletAddr, circle.issuer));
      flash("USDC trustline added — now get testnet USDC");
    } catch (e) {
      flash(walletErr(e), false);
    } finally {
      setBusy(false);
    }
  }

  async function depositViaWallet() {
    if (!walletAddr || !circle) return;
    const resume = pending?.asset === "usdc";
    const amt = Number(depAmt);
    if (!resume) {
      if (!amt || amt <= 0) return flash("Enter an amount", false);
      if (walBal != null && amt > walBal) return flash("Not enough USDC in your wallet", false);
    }
    setBusy(true);
    setDepResult(null);
    let sent = resume;
    try {
      if (!resume) {
        // Mark pending BEFORE the send so that if convert fails we retry convert, not re-send.
        await sendUsdc({ from: walletAddr, to: circle.castel, issuer: circle.issuer, amount: String(amt) });
        savePending({ asset: "usdc" });
        sent = true;
        report({
          status: "pending",
          method: "USDC",
          paid: `${amt} USDC`,
          note: "Sent from your wallet — converting to rupiah…",
        });
      }
      const res = await api.depositCircleConvert();
      savePending(null);
      setBalances(res.balances);
      setWalBal(await usdcBalance(walletAddr, circle.issuer));
      setShowDeposit(false);
      report({
        status: "success",
        method: "USDC",
        cidr: res.cidr,
        paid: `${res.usdc} USDC`,
        savingsIdr: res.savingsIdr,
        hash: res.hash,
      });
      refresh();
    } catch (e) {
      report({
        status: "error",
        method: "USDC",
        note:
          walletErr(e) +
          (sent
            ? " — your USDC did leave your wallet. Tap “Finish converting” to credit it; do not send again."
            : ""),
      });
    } finally {
      setBusy(false);
    }
  }

  // Native XLM deposit: pay XLM straight to the treasury, then convert verifies by hash.
  async function depositXlm() {
    if (!walletAddr) return;
    const resume = pending?.asset === "xlm" && !!pending.hash;
    const amt = Number(depAmt);
    if (!resume) {
      if (!amt || amt <= 0) return flash("Enter an amount", false);
      // Leave ~1.5 XLM for the base reserve + fee, or the on-chain payment underfunds.
      if (xlmBal != null && amt > xlmBal - 1.5)
        return flash("Leave ~1.5 XLM for the network reserve", false);
    }
    setBusy(true);
    setDepResult(null);
    let sent = resume;
    try {
      let hash = resume ? pending!.hash! : "";
      if (!hash) {
        const prep = await api.depositXlmPrepare();
        hash = await sendXlm({
          from: walletAddr,
          to: prep.destination,
          amount: String(amt),
          memo: prep.memo,
        });
        // Persist the sent hash BEFORE converting so a convert failure retries convert, not send.
        savePending({ asset: "xlm", hash });
        sent = true;
        report({
          status: "pending",
          method: "XLM",
          paid: `${amt} XLM`,
          hash,
          note: "Sent from your wallet — converting to rupiah…",
        });
      }
      const res = await api.depositXlmConvert(hash);
      savePending(null);
      setBalances(res.balances);
      setXlmBal(await nativeBalance(walletAddr));
      setShowDeposit(false);
      report({
        status: "success",
        method: "XLM",
        cidr: res.cidr,
        paid: `${res.xlm} XLM`,
        savingsIdr: res.savingsIdr,
        hash: res.hash,
      });
      refresh();
    } catch (e) {
      report({
        status: "error",
        method: "XLM",
        note:
          walletErr(e) +
          (sent
            ? " — your XLM did leave your wallet. Tap “Finish converting” to credit it; do not send again."
            : ""),
      });
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

  // Onboarding, not a nudge: the PIN is created in the same sitting as the OTP, before any
  // money can arrive. A wallet that can be funded before it can be defended is the wrong order.
  if (!hasPin) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <div className="animate-rise">
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold">
            One last step
          </h1>
          <p className="mt-2 text-muted-foreground">
            Create the 6-digit PIN you&apos;ll use every time you spend.
          </p>
        </div>
        <PinPrompt
          confirm
          mandatory
          title="Create your PIN"
          subtitle="Six digits. You'll enter it every time you spend — even if someone else gets into your WhatsApp."
          busy={busy}
          error={pinError}
          onSubmit={createPin}
          onCancel={() => {}}
        />
      </main>
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

      <InstallPrompt />

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
                    {m === "card" ? "Fiat" : "Crypto"}
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
                        {busy ? "Redirecting…" : "Top up with card"}
                      </button>
                      <Link
                        href="/guide"
                        className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-white/80 underline underline-offset-2"
                      >
                        Testing? See the guide for the test card
                      </Link>
                    </>
                  )}
                </>
              ) : (
                <>
                  {!walletAddr ? (
                    <button
                      onClick={connect}
                      disabled={busy}
                      className="w-full rounded-full bg-white py-2.5 text-sm font-semibold text-primary shadow transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {busy ? "Connecting…" : "Connect Wallet"}
                    </button>
                  ) : (
                    <>
                      <div className="flex items-center justify-between rounded-lg bg-white/20 px-3 py-2 text-xs">
                        <span className="font-[family-name:var(--font-mono)]">
                          {walletAddr.slice(0, 4)}…{walletAddr.slice(-4)}
                        </span>
                        <button
                          onClick={disconnect}
                          className="underline underline-offset-2 opacity-80 transition active:scale-95"
                        >
                          disconnect
                        </button>
                      </div>

                      {!netOk && (
                        <p className="mt-2 rounded-lg bg-warning/40 px-3 py-2 text-[11px]">
                          Your wallet isn&apos;t on Testnet. Switch it to Testnet, then reconnect.
                        </p>
                      )}

                      <div className="mt-3 flex rounded-full bg-white/15 p-0.5 text-xs font-medium">
                        {(["xlm", "usdc"] as const).map((a) => (
                          <button
                            key={a}
                            onClick={() => setCryptoAsset(a)}
                            className={`flex-1 rounded-full py-1.5 transition ${
                              cryptoAsset === a ? "bg-white text-primary shadow" : "text-white/80"
                            }`}
                          >
                            {a === "xlm" ? "XLM" : "USDC"}
                          </button>
                        ))}
                      </div>

                      {cryptoAsset === "usdc" ? (
                        <>
                          {xlmBal === null ? (
                            <p className="mt-3 text-xs text-white/80">
                              This wallet isn&apos;t funded on testnet yet. In Freighter (Testnet),
                              tap <span className="font-medium text-white">Fund with Friendbot</span>,
                              then{" "}
                              <button
                                onClick={reloadBalances}
                                className="underline underline-offset-2"
                              >
                                refresh
                              </button>
                              .
                            </p>
                          ) : walBal == null ? (
                            <>
                              <p className="mt-3 text-xs text-white/80">
                                Your wallet needs a USDC trustline before it can hold testnet USDC.
                              </p>
                              <button
                                onClick={trustWallet}
                                disabled={busy || !netOk}
                                className="mt-2 w-full rounded-full bg-white/90 py-2 text-sm font-semibold text-primary shadow transition active:scale-[0.98] disabled:opacity-50"
                              >
                                {busy ? "Adding…" : "Add USDC trustline"}
                              </button>
                            </>
                          ) : (
                            <p className="mt-3 text-xs text-white/80">
                              Wallet holds{" "}
                              <span className="font-[family-name:var(--font-mono)]">
                                {walBal.toFixed(2)}
                              </span>{" "}
                              USDC
                            </p>
                          )}

                          <a
                            href="https://faucet.circle.com"
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block text-[11px] text-white/70 underline underline-offset-2"
                          >
                            Need testnet USDC? Get it from Circle&apos;s faucet (Stellar Testnet) ↗
                          </a>

                          <div className="mt-3 flex items-center gap-2">
                            <span className="font-[family-name:var(--font-mono)] text-lg">$</span>
                            <input
                              type="number"
                              value={depAmt}
                              onChange={(e) => setDepAmt(e.target.value)}
                              className="w-full min-w-0 rounded-lg bg-white/90 px-3 py-2 font-[family-name:var(--font-mono)] text-lg text-foreground outline-none"
                            />
                          </div>
                          <div className="mt-2 flex gap-2">
                            {[20, 50, 100].map((v) => (
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
                            </div>
                          )}
                          <button
                            onClick={depositViaWallet}
                            disabled={busy || !netOk || (pending?.asset !== "usdc" && walBal == null)}
                            className="mt-3 w-full rounded-full bg-white py-2.5 text-sm font-semibold text-primary shadow transition active:scale-[0.98] disabled:opacity-50"
                          >
                            {busy
                              ? "Depositing…"
                              : pending?.asset === "usdc"
                                ? "Finish converting →"
                                : `Deposit ${depAmt || 0} USDC →`}
                          </button>
                        </>
                      ) : (
                        <>
                          {xlmBal != null && xlmBal > 0 ? (
                            <p className="mt-3 text-xs text-white/80">
                              Wallet holds{" "}
                              <span className="font-[family-name:var(--font-mono)]">
                                {xlmBal.toFixed(2)}
                              </span>{" "}
                              XLM
                            </p>
                          ) : (
                            <p className="mt-3 text-xs text-white/80">
                              No XLM in this wallet yet — open Freighter and tap{" "}
                              <span className="font-medium text-white">Fund with Friendbot</span> on
                              Testnet, then{" "}
                              <button
                                onClick={reloadBalances}
                                className="underline underline-offset-2"
                              >
                                refresh
                              </button>
                              .
                            </p>
                          )}

                          <div className="mt-3 flex items-center gap-2">
                            <span className="font-[family-name:var(--font-mono)] text-sm text-white/80">
                              XLM
                            </span>
                            <input
                              type="number"
                              value={depAmt}
                              onChange={(e) => setDepAmt(e.target.value)}
                              className="w-full min-w-0 rounded-lg bg-white/90 px-3 py-2 font-[family-name:var(--font-mono)] text-lg text-foreground outline-none"
                            />
                          </div>
                          <div className="mt-2 flex gap-2">
                            {[10, 50, 100].map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setDepAmt(String(v))}
                                className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium transition active:scale-95"
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                          <p className="mt-2 text-[11px] text-white/60">
                            Converted at the live XLM rate, minus a 0.3% spread.
                          </p>
                          <button
                            onClick={depositXlm}
                            disabled={busy || !netOk || (pending?.asset !== "xlm" && !xlmBal)}
                            className="mt-3 w-full rounded-full bg-white py-2.5 text-sm font-semibold text-primary shadow transition active:scale-[0.98] disabled:opacity-50"
                          >
                            {busy
                              ? "Depositing…"
                              : pending?.asset === "xlm"
                                ? "Finish converting →"
                                : `Deposit ${depAmt || 0} XLM →`}
                          </button>
                        </>
                      )}
                    </>
                  )}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-[11px] text-white/70">
                      No wallet extension? Send USDC manually
                    </summary>
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
                      className="mt-3 flex w-full items-start gap-2 rounded-lg bg-white/20 px-3 py-2 text-left font-[family-name:var(--font-mono)] text-[11px] transition active:scale-[0.99]"
                    >
                      <span className="min-w-0 flex-1 break-all">{wal?.publicKey ?? "…"}</span>
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mt-0.5 shrink-0 opacity-70"
                        aria-label="Copy"
                      >
                        <rect x="9" y="9" width="11" height="11" rx="2" />
                        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                      </svg>
                    </button>
                    <button
                      onClick={convertUsdc}
                      disabled={busy}
                      className="mt-3 w-full rounded-full bg-white/90 py-2 text-sm font-semibold text-primary shadow transition active:scale-[0.98] disabled:opacity-50"
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
                  </details>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {depResult && (
        <section
          className={`animate-rise mt-4 rounded-2xl border p-5 shadow-sm ${
            depResult.status === "error"
              ? "border-destructive/30 bg-destructive/5"
              : "border-primary/25 bg-primary-soft"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-semibold ${
                depResult.status === "error"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary"
              }`}
              aria-hidden
            >
              {depResult.status === "success" ? "✓" : depResult.status === "error" ? "!" : "＋"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-[family-name:var(--font-heading)] text-base font-semibold">
                  {depResult.title ?? OUTCOME_TITLE[depResult.status]}
                </h2>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {depResult.method}
                </span>
              </div>
              {depResult.status === "success" && depResult.cidr != null && (
                <p className="mt-1 font-[family-name:var(--font-mono)] text-3xl font-bold tracking-tight text-primary">
                  +{idr(depResult.cidr)}
                </p>
              )}
              {depResult.note && (
                <p className="mt-1 text-sm text-muted-foreground">{depResult.note}</p>
              )}
            </div>
            <button
              onClick={() => setDepResult(null)}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 shrink-0 rounded-full px-2 py-1 text-lg leading-none text-muted-foreground transition active:scale-90"
            >
              ×
            </button>
          </div>

          {(depResult.paid || depResult.savingsIdr != null || depResult.status === "success") && (
            <dl className="mt-4 space-y-1.5 border-t border-primary/15 pt-3 text-sm">
              {depResult.paid && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">You paid</dt>
                  <dd className="font-[family-name:var(--font-mono)]">{depResult.paid}</dd>
                </div>
              )}
              {depResult.savingsIdr != null && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">
                    {depResult.savingsIdr >= 0 ? "You saved vs money changer" : "vs money changer"}
                  </dt>
                  <dd
                    className={`font-[family-name:var(--font-mono)] font-semibold ${
                      depResult.savingsIdr >= 0 ? "text-success" : "text-muted-foreground"
                    }`}
                  >
                    {depResult.savingsIdr >= 0 ? "+" : ""}
                    {idr(depResult.savingsIdr)}
                  </dd>
                </div>
              )}
              {depResult.status === "success" && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">New balance</dt>
                  <dd className="font-[family-name:var(--font-mono)] font-semibold">{idr(cidr)}</dd>
                </div>
              )}
            </dl>
          )}

          {isStellarHash(depResult.hash) && (
            <a
              href={EXPLORER + depResult.hash}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs font-medium text-primary underline underline-offset-2"
            >
              View on-chain ↗
            </a>
          )}
        </section>
      )}

      {usdc > 0 && (
      <section className="animate-rise mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">Exchange to rupiah</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Convert USDC held in your wallet to rupiah.
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
              disabled={v > usdc}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition active:scale-95 disabled:opacity-40"
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

        {quote && Number(amount) <= usdc && (
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
                {quote.savingsIdr >= 0 ? "You save" : "Difference"}
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

        {Number(amount) > usdc && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2.5 text-sm text-warning">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0"
            >
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
            <span>Amount is more than your USDC balance.</span>
          </div>
        )}

        <button
          onClick={swap}
          disabled={busy || !quote || Number(amount) > usdc || Number(amount) <= 0}
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
            {(showAllHistory ? history : history.slice(0, 5)).map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm ${
                    tx.direction === "in" ? "bg-success-soft text-success" : "bg-muted text-foreground"
                  }`}
                >
                  {tx.type === "swap"
                    ? "⇄"
                    : tx.type === "pay" || tx.type === "quickpay"
                      ? "↑"
                      : tx.type === "deposit"
                        ? "＋"
                        : "↓"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{tx.title}</p>
                    {tx.type === "quickpay" && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Quick Pay
                      </span>
                    )}
                  </div>
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
          {history.length > 5 && (
            <button
              onClick={() => setShowAllHistory((v) => !v)}
              className="mt-3 w-full py-2 text-center text-sm font-medium text-primary transition active:scale-[0.99]"
            >
              {showAllHistory ? "View less" : `View more (${history.length - 5})`}
            </button>
          )}
        </section>
      )}

      {toast && (
        <div
          className={`animate-rise fixed inset-x-0 bottom-28 z-50 mx-auto w-fit max-w-[90%] rounded-full px-5 py-3 text-center text-sm shadow-xl ${
            toast.ok ? "bg-foreground text-background" : "bg-destructive text-white"
          }`}
        >
          {toast.m}
        </div>
      )}

      <BottomNav />
    </main>
  );
}

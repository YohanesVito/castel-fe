import { clearSession, getToken } from "./session";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type Balances = { cIDR: string; USDC: string };

export type Quote = {
  usdc: number;
  cidrOut: number;
  rate: number;
  midRate: number;
  midSource: "live" | "cached" | "stored" | "fallback";
  changerRate: number;
  changerCidr: number;
  savingsIdr: number;
};

export type Limits = {
  tier: number;
  tierName: string;
  spentIdr: number;
  spendCapIdr: number;
  remainingIdr: number;
  depositedIdr: number;
  depositCapIdr: number;
  windowDays: number;
};

export type Session = { token: string; waNumber: string; publicKey: string; hasPin: boolean };

export type QrisInfo = {
  merchantName: string;
  city: string;
  amount: number | null;
  currency: string;
  isStatic: boolean;
};

export type Settlement =
  | { id: string; status: string; amount: number; channel: string }
  | { error: string };

export type PayResult = {
  merchant: string;
  city: string;
  amountIdr: number;
  hash: string;
  settlement: Settlement | null;
  balances: Balances;
};

export type Tx = {
  id: number;
  type: "swap" | "pay" | "cashout" | "deposit" | "quickpay";
  title: string;
  amountIdr: number;
  direction: "in" | "out";
  hash: string | null;
  createdAt: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function req<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts?.body) headers["content-type"] = "application/json";
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method: opts?.method ?? "GET",
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    // An expired or revoked session should send the user back to sign-in, not
    // leave the page half-rendered with a stale token.
    if (res.status === 401) clearSession();
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err?.error ?? res.statusText, res.status);
  }
  return res.json();
}

export const api = {
  authRequest: (waNumber: string) =>
    req<{ sent: boolean }>("/auth/request", { method: "POST", body: { waNumber } }),
  authVerify: (waNumber: string, otp: string) =>
    req<Session>("/auth/verify", { method: "POST", body: { waNumber, otp } }),
  authExchange: (linkToken: string) =>
    req<Session>("/auth/exchange", { method: "POST", body: { linkToken } }),

  me: () => req<{ waNumber: string; publicKey: string; hasPin: boolean }>("/me"),
  setPin: (pin: string) => req<{ ok: boolean }>("/me/pin", { method: "POST", body: { pin } }),
  balance: () => req<Balances>("/me/balance"),
  limits: () => req<Limits>("/me/limits"),
  history: () => req<Tx[]>("/me/history"),
  wallet: () =>
    req<{
      publicKey: string;
      usdc: { code: string; issuer: string };
      balances: Balances;
      hasSavedCard: boolean;
      cardLast4: string | null;
    }>("/me/wallet"),

  quote: (usdc: number) => req<Quote>(`/fx/quote?usdc=${usdc}`),
  fund: (usdc: number) => req<Balances>("/fund", { method: "POST", body: { usdc } }),
  depositCreate: (usd: number) =>
    req<{ url: string }>("/deposit/create", { method: "POST", body: { usd } }),
  depositCharge: (usd: number) =>
    req<{
      credited: boolean;
      usd: number;
      cidr?: number;
      savingsIdr?: number;
      exchangeFailed?: string;
      balances: Balances;
    }>("/deposit/charge", { method: "POST", body: { usd } }),
  depositUsdcConvert: () =>
    req<{ credited: boolean; usdc: number; cidr: number; savingsIdr: number; balances: Balances }>(
      "/deposit/usdc/convert",
      { method: "POST" },
    ),
  // Crypto on-ramp with a connected wallet (Freighter): prepare trustlines the Castel
  // address to Circle USDC and returns where to send it; convert credits rupiah for USDC
  // that has arrived.
  depositCirclePrepare: () =>
    req<{ publicKey: string; asset: { code: string; issuer: string } }>("/deposit/circle/prepare", {
      method: "POST",
    }),
  depositCircleConvert: () =>
    req<{
      credited: boolean;
      usdc: number;
      cidr: number;
      savingsIdr: number;
      hash: string;
      balances: Balances;
    }>("/deposit/circle/convert", { method: "POST" }),
  // Native XLM on-ramp: prepare returns the treasury to pay, convert verifies the XLM
  // payment by hash and credits rupiah.
  depositXlmPrepare: () =>
    req<{ destination: string }>("/deposit/xlm/prepare", { method: "POST" }),
  depositXlmConvert: (hash: string) =>
    req<{
      credited: boolean;
      xlm: number;
      cidr: number;
      savingsIdr: number;
      hash: string;
      balances: Balances;
    }>("/deposit/xlm/convert", { method: "POST", body: { hash } }),
  depositConfirm: (sessionId: string) =>
    req<{
      credited: boolean;
      usd: number;
      cidr?: number;
      savingsIdr?: number;
      exchangeFailed?: string;
      balances: Balances;
    }>("/deposit/confirm", { method: "POST", body: { sessionId } }),
  swap: (usdc: number) =>
    req<{ hash: string; quote: Quote; balances: Balances }>("/fx/swap", {
      method: "POST",
      body: { usdc },
    }),

  decodeQris: (payload: string) =>
    req<QrisInfo>("/qris/decode", { method: "POST", body: { payload } }),
  pay: (payload: string, pin: string, amount?: number) =>
    req<PayResult>("/pay", { method: "POST", body: { payload, amount, pin } }),
  quickPayCreate: (payload: string, amount?: number) =>
    req<{ url: string; usd: number; amountIdr: number }>("/pay/quick/create", {
      method: "POST",
      body: { payload, amount },
    }),
  quickPayConfirm: (sessionId: string) =>
    req<PayResult & { alreadyPaid?: boolean }>("/pay/quick/confirm", {
      method: "POST",
      body: { sessionId },
    }),

  cashoutRequest: (amountIdr: number, pin: string) =>
    req<{ escrowId: number; codeHex: string; amountIdr: number; balances: Balances }>(
      "/cashout/request",
      { method: "POST", body: { amountIdr, pin } },
    ),
  cashoutInfo: (escrowId: number) =>
    req<{ escrowId: number; amountIdr: number; agentReceives: number; status: string }>(
      `/cashout/${escrowId}`,
    ),
  cashoutRedeem: (escrowId: number, codeHex: string) =>
    req<{ escrowId: number; amountIdr: number; agentReceived: number; fee: number }>(
      "/cashout/redeem",
      { method: "POST", body: { escrowId, codeHex } },
    ),
};

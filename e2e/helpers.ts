import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Auth bypass: mint a magic-link token exactly the way the backend's signToken
// does, so /auth/exchange accepts it and no WhatsApp OTP is needed. This reads
// SESSION_SECRET straight from castel-be/.env so FE and BE always agree.
// ---------------------------------------------------------------------------

const LINK_TTL_MS = 15 * 60_000; // mirrors LINK_TTL_MS in castel-be/src/lib/auth.ts

function sessionSecret(): string {
  const envPath = path.resolve(process.cwd(), "../castel-be/.env");
  const txt = readFileSync(envPath, "utf8");
  const m = txt.match(/^\s*SESSION_SECRET\s*=\s*(.+)\s*$/m);
  if (!m) throw new Error(`SESSION_SECRET not found in ${envPath}`);
  return m[1].trim();
}

export function mintLinkToken(wa: string): string {
  const body = Buffer.from(
    JSON.stringify({ wa, exp: Date.now() + LINK_TTL_MS, kind: "link" }),
  ).toString("base64url");
  const sig = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** A fresh, unique phone per test so runs never collide on the same user/limits. */
export function uniquePhone(): string {
  return "+62800" + Date.now() + Math.floor(Math.random() * 1000);
}

export const PIN = "123456";

// ---------------------------------------------------------------------------
// Flow helpers
// ---------------------------------------------------------------------------

/** Magic-link sign-in → lands on /wallet with the balance card rendered. */
export async function signIn(page: Page, wa: string): Promise<void> {
  const token = mintLinkToken(wa);
  await page.goto(`/wallet?t=${encodeURIComponent(token)}`);
  await expect(page.getByText("Your balance")).toBeVisible({ timeout: 60_000 });
}

/** Create the 6-digit payment PIN via the wallet PIN prompt. */
export async function setPin(page: Page, pin = PIN): Promise<void> {
  await page.getByRole("button", { name: "Set your payment PIN" }).click();
  const fields = page.locator('input[type="password"]');
  await fields.nth(0).fill(pin);
  await fields.nth(1).fill(pin); // confirm field
  await page.getByRole("button", { name: "Set PIN" }).click();
  await expect(page.getByText("PIN set", { exact: false })).toBeVisible({ timeout: 30_000 });
}

/** Open Add money → Crypto tab → expand the manual sheet → tap the testnet faucet for 200 USDC. */
export async function faucetUsdc(page: Page): Promise<void> {
  await page.getByRole("button", { name: "+ Add money" }).click();
  await page.getByRole("button", { name: "Crypto", exact: true }).click();
  // The demo faucet + manual convert now live under the "No wallet extension?" disclosure.
  await page.getByText("No wallet extension? Send USDC manually").click();
  await page.getByRole("button", { name: "Testnet: get 200 test USDC" }).click();
  await expect(page.getByText("Topped up 200 USDC")).toBeVisible({ timeout: 90_000 });
}

/**
 * Convert the wallet's USDC to rupiah (the no-Stripe path). The Stellar DEX swap
 * occasionally hiccups on testnet; a failed convert leaves the USDC untouched and
 * keeps the sheet open, so we retry until a "deposit" lands in Recent activity.
 */
export async function convertUsdcToRupiah(page: Page): Promise<void> {
  const convertBtn = page.getByRole("button", { name: "convert to rupiah" });
  const history = page.getByText("Recent activity");

  // Ensure the manual disclosure is open (faucetUsdc opens it, but be defensive if called alone).
  if (!(await convertBtn.isVisible().catch(() => false))) {
    await page
      .getByText("No wallet extension? Send USDC manually")
      .click()
      .catch(() => {});
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    // On success the sheet closes and the button vanishes — nothing left to retry.
    if (!(await convertBtn.isVisible().catch(() => false))) break;
    await convertBtn.click();
    try {
      await expect(history).toBeVisible({ timeout: 60_000 });
      break;
    } catch {
      // Swap likely stalled on testnet; USDC is still on the wallet, so loop and retry.
    }
  }

  await expect(history).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("(USDC)", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Fund the wallet with the testnet USDC faucet, then convert it to rupiah.
 * Leaves the wallet with a non-zero rupiah balance.
 */
export async function fundRupiahBalance(page: Page): Promise<void> {
  await faucetUsdc(page);
  await convertUsdcToRupiah(page);
}

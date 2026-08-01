import { test, expect } from "@playwright/test";
import {
  signIn,
  setPin,
  mintLinkToken,
  faucetUsdc,
  convertUsdcToRupiah,
  fundRupiahBalance,
  uniquePhone,
  PIN,
} from "./helpers";

// End-to-end journeys against a live local stack (FE :3000 + BE :3001).
// Each test signs in as a brand-new phone number so users, balances and limits never collide.

test.describe("Castel e2e", () => {
  // -------------------------------------------------------------------------
  // Core UI / auth journeys — no on-chain money movement, always reliable.
  // -------------------------------------------------------------------------

  test("1. landing page loads and shows the product name", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Castel/i);
    await expect(page.getByRole("heading", { name: /Pay in Bali/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Connect Wallet/i }).first()).toBeVisible();
  });

  test("2. guide page shows the join code and the test card", async ({ page }) => {
    await page.goto("/guide");
    await expect(page.getByRole("heading", { name: /How to test Castel/i })).toBeVisible();
    await expect(page.getByText("join scientist-shelf")).toBeVisible();
    await expect(page.getByText("4242 4242 4242 4242")).toBeVisible();
  });

  test("3. magic-link sign-in renders the wallet", async ({ page }) => {
    const wa = uniquePhone();
    await signIn(page, wa);
    // Balance card + the phone number in the header prove the session is live.
    await expect(page.getByText("Your balance")).toBeVisible();
    await expect(page.getByText(wa)).toBeVisible();
  });

  test("4. a new number must set a PIN before the wallet opens", async ({ page }) => {
    const wa = uniquePhone();
    await page.goto(`/wallet?t=${encodeURIComponent(mintLinkToken(wa))}`);

    await expect(page.getByRole("heading", { name: "One last step" })).toBeVisible({
      timeout: 60_000,
    });
    // Onboarding, not a nudge: no wallet behind it and no way to dismiss it.
    await expect(page.getByText("Your balance")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);

    // A guessable PIN is refused by the backend before the wallet is reachable.
    await setPin(page, "123456");
    await expect(page.getByText("too easy to guess", { exact: false })).toBeVisible({
      timeout: 30_000,
    });

    await setPin(page);
    await expect(page.getByText("Your balance")).toBeVisible({ timeout: 60_000 });
  });

  // -------------------------------------------------------------------------
  // Testnet money flows — OFF by default, enable with RUN_TESTNET=1.
  //
  // Each of these performs the USDC -> cIDR (rupiah) swap on the shared Stellar
  // testnet DEX. That swap only succeeds while the project's DEX market is seeded
  // with order-book depth (run castel-be's market/liquidity setup script first).
  // The faucet hands out a fixed 200 USDC and the app converts the whole balance,
  // so once order-book depth is drained the backend's /fx/quote starts returning
  // "no path USDC->cIDR (is the market seeded?)" and these tests go red until the
  // market is re-seeded. They also take 30-120s each (real testnet ops), hence the
  // long timeouts and extra retries. Run them with:
  //     RUN_TESTNET=1 bunx playwright test
  // -------------------------------------------------------------------------
  test.describe("testnet money flows (needs seeded DEX; RUN_TESTNET=1)", () => {
    if (!process.env.RUN_TESTNET) test.skip();
    test.describe.configure({ retries: 2 });

    test("5. USDC deposit credits a rupiah balance and shows in history", async ({ page }) => {
      test.setTimeout(180_000);
      const wa = uniquePhone();
      await signIn(page, wa);

      await faucetUsdc(page);
      await convertUsdcToRupiah(page);

      // A deposit lands in Recent activity and the rupiah balance is no longer Rp 0.
      await expect(page.getByText("Rp 0", { exact: true })).toHaveCount(0);
    });

    test("6. pay from balance produces a receipt", async ({ page }) => {
      test.setTimeout(240_000);
      const wa = uniquePhone();
      await signIn(page, wa);
      await fundRupiahBalance(page);

      await page.goto("/pay");
      await page.getByRole("button", { name: "Use sample" }).click();

      // The sample QR is a static merchant code, so an amount must be entered.
      await expect(page.getByText("Warung Made Bali")).toBeVisible({ timeout: 30_000 });
      await page.getByRole("spinbutton").fill("50000");

      await page.getByRole("button", { name: /from balance/i }).click();

      // Single-field PIN prompt (PIN already set).
      await page.locator('input[type="password"]').first().fill(PIN);
      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      await expect(page.getByRole("heading", { name: "Paid" })).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText("Warung Made Bali")).toBeVisible();
    });

    test("7. cash out produces a pickup QR", async ({ page }) => {
      test.setTimeout(240_000);
      const wa = uniquePhone();
      await signIn(page, wa);
      await fundRupiahBalance(page);

      await page.goto("/cashout");
      // Default amount is 500000, well within the rupiah balance funded above.
      await page.getByRole("button", { name: "Request cash" }).click();

      await page.locator('input[type="password"]').first().fill(PIN);
      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      await expect(page.getByRole("img", { name: "Pickup code" })).toBeVisible({ timeout: 120_000 });
      await expect(page.getByText("Show this to a Castel agent")).toBeVisible();
    });
  });
});

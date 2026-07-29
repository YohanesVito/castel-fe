import { defineConfig, devices } from "@playwright/test";

// Drives the REAL Castel app in a browser against a LOCAL stack (BE :3001 + FE :3000).
// The two servers are launched by the `webServer` block below (reused if already up).
// Stellar testnet ops (fund / convert / pay / escrow) take 5-20s each, so timeouts are generous.

const FE_PORT = 3000;
const BE_PORT = 3001;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // Live-testnet ops (fund/convert/pay/escrow) occasionally hiccup, especially back-to-back;
  // one retry absorbs a transient blip. The heavy flows opt into more (see the spec).
  retries: 2,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],

  use: {
    baseURL: `http://localhost:${FE_PORT}`,
    trace: "retain-on-failure",
    // The /pay page opens the camera. A fake media device (see launchOptions) plus a
    // pre-granted permission means it starts cleanly instead of showing an error overlay;
    // the tests still pay via the "Use sample" button, never a real scan.
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: [
    {
      // Backend (Hono/Bun). Bun auto-loads castel-be/.env (SESSION_SECRET, ALLOW_DEMO_FUND,
      // DATABASE_URL, LOG_OTP) from the cwd.
      command: "bun run src/index.ts",
      cwd: "../castel-be",
      url: `http://localhost:${BE_PORT}/`,
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // Frontend (Next.js). NEXT_PUBLIC_API_URL already points at :3001 in castel-fe/.env.
      command: "bun run dev",
      url: `http://localhost:${FE_PORT}`,
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});

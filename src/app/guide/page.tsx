import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to test Castel — Judge guide",
  description: "A step-by-step guide for hackathon judges to test Castel end to end.",
};

const JOIN_CODE = "scientist-shelf";

const steps = [
  {
    n: "1",
    t: "Sign in",
    body: (
      <>
        <p className="text-sm text-muted-foreground">
          Go to{" "}
          <a
            href="https://castelpay.vercel.app/wallet"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            castelpay.vercel.app/wallet
          </a>
          . Enter your WhatsApp number with country code (e.g.{" "}
          <span className="font-[family-name:var(--font-mono)]">+61…</span>) and tap{" "}
          <span className="font-medium text-foreground">&ldquo;Send code on WhatsApp&rdquo;</span>.
          Enter the 6-digit code that arrives, then set a 6-digit PIN.
        </p>
      </>
    ),
  },
  {
    n: "2",
    t: "Top up with a card",
    body: (
      <>
        <p className="text-sm text-muted-foreground">
          Tap <span className="font-medium text-foreground">&ldquo;+ Add money&rdquo;</span> and
          enter an amount. On the Stripe screen use TEST card{" "}
          <Mono>4242 4242 4242 4242</Mono>, any future expiry (e.g.{" "}
          <span className="font-[family-name:var(--font-mono)]">12/34</span>), any CVC (e.g.{" "}
          <span className="font-[family-name:var(--font-mono)]">123</span>), and any postal code.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Your balance appears in <span className="font-medium text-foreground">rupiah</span> — the
          USDC is auto-converted on Stellar.
        </p>
      </>
    ),
  },
  {
    n: "3",
    t: "Pay a QRIS merchant",
    body: (
      <p className="text-sm text-muted-foreground">
        Open <span className="font-medium text-foreground">Pay</span>, point the camera at a QRIS
        code or tap <span className="font-medium text-foreground">&ldquo;Use sample&rdquo;</span>,
        confirm, and enter your PIN. The merchant is settled in real rupiah (Xendit sandbox).
      </p>
    ),
  },
  {
    n: "4",
    t: "Deposit with USDC",
    optional: true,
    body: (
      <p className="text-sm text-muted-foreground">
        For crypto-native users: send Stellar testnet USDC to your Castel address and it converts
        to rupiah.
      </p>
    ),
  },
  {
    n: "5",
    t: "Cash out",
    optional: true,
    body: (
      <p className="text-sm text-muted-foreground">
        Request cash and enter your PIN to get a pickup QR. The{" "}
        <span className="font-[family-name:var(--font-mono)]">/agent</span> page scans it to release
        the on-chain Soroban escrow and hand over rupiah.
      </p>
    ),
  },
];

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[0.85em] text-foreground">
      {children}
    </code>
  );
}

export default function GuidePage() {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-24">
      <header className="sticky top-0 z-10 -mx-5 mb-4 border-b border-border/60 bg-background/70 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-muted-foreground">
            ← Home
          </Link>
          <span className="font-[family-name:var(--font-heading)] font-bold">Judge guide</span>
        </div>
      </header>

      <div className="animate-rise">
        <span className="inline-block rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success">
          For hackathon judges
        </span>
        <h1 className="mt-4 font-[family-name:var(--font-heading)] text-4xl font-bold leading-tight tracking-tight">
          How to test Castel
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          A five-minute walkthrough of the full flow — sign in on WhatsApp, top up with a card, pay
          a merchant, and cash out. Follow the steps in order.
        </p>
      </div>

      {/* Step 0 — prerequisites */}
      <section className="animate-rise mt-8 rounded-2xl border border-warning/40 bg-warning-soft p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-warning">
            Before you start (important)
          </h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Two quick prerequisites — skip either and the sign-in will silently fail.
        </p>

        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">1. Warm up the backend</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open{" "}
              <a
                href="https://castel-be.onrender.com"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                castel-be.onrender.com
              </a>{" "}
              in a tab and wait until you see <Mono>{`{"ok":true}`}</Mono>. Render&apos;s free tier
              sleeps after ~15 min idle and takes 30–60s to wake — without this, the first sign-in
              request times out.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">2. Join the WhatsApp sandbox</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign-in sends a one-time code over WhatsApp via Twilio&apos;s sandbox, which only
              delivers to numbers that have opted in. On WhatsApp, send this message to{" "}
              <Mono>+1 415 523 8886</Mono>:
            </p>
            <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <code className="block font-[family-name:var(--font-mono)] text-base font-semibold text-primary">
                join {JOIN_CODE}
              </code>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              You should get back <span className="italic">&ldquo;You are all set!&rdquo;</span>
            </p>
          </div>
        </div>
      </section>

      {/* Numbered steps */}
      <section className="animate-rise mt-8 space-y-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-end text-sm font-bold text-primary-foreground">
                {s.n}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {s.t}
                  {s.optional && (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Optional
                    </span>
                  )}
                </p>
                <div className="mt-1.5">{s.body}</div>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Good to know */}
      <section className="animate-rise mt-8 rounded-2xl border border-border bg-muted/50 p-5">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">
          Good to know
        </h2>
        <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              Everything runs on Stellar <span className="font-medium text-foreground">testnet</span>{" "}
              with sandbox keys — no real money moves.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              The deployed Soroban escrow contract is{" "}
              <span className="mt-1 block break-all">
                <Mono>CDG65OKWGLIOADVHGZXOF5QVH3HYQCRL4KBOCK5T67SOS4B246VXW6UG</Mono>
              </span>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              Source is open at{" "}
              <a
                href="https://github.com/CastelPay"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                github.com/CastelPay
              </a>
              .
            </span>
          </li>
        </ul>
      </section>

      {/* Friendly note */}
      <div className="animate-rise mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">First message got no reply?</span> The
          backend was probably still asleep — just resend it once and it&apos;ll come through.
        </p>
      </div>

      <div className="animate-rise mt-8 text-center">
        <Link
          href="/wallet"
          className="inline-block rounded-full bg-gradient-to-r from-primary to-primary-end px-7 py-3.5 font-semibold text-primary-foreground shadow-md transition active:scale-[0.98]"
        >
          Start testing →
        </Link>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Built on Stellar · merchants always settle in rupiah
      </p>
    </main>
  );
}

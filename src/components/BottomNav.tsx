"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// A native-app-style bottom tab bar. Only shown on the two scrolling app screens; the
// full-screen scanner (/pay) and the marketing/guide pages render without it.
const SHOW_ON = ["/wallet", "/cashout"];

export function BottomNav() {
  const path = usePathname();
  if (!SHOW_ON.includes(path)) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto max-w-md px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="relative flex items-center justify-between rounded-2xl border border-border bg-background/90 px-10 py-2.5 shadow-lg backdrop-blur-md">
          <Tab href="/wallet" label="Wallet" active={path === "/wallet"} icon={<WalletIcon />} />

          {/* Pay sits above the bar as the primary action — the mobile-first centrepiece. */}
          <Link
            href="/pay"
            aria-label="Pay QRIS"
            className="absolute -top-5 left-1/2 flex h-14 w-14 -translate-x-1/2 flex-col items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-end text-primary-foreground shadow-lg ring-4 ring-background transition active:scale-95"
          >
            <ScanIcon />
          </Link>
          <span className="absolute left-1/2 top-[calc(100%-0.35rem)] -translate-x-1/2 text-[10px] font-medium text-muted-foreground">
            Pay
          </span>

          <Tab href="/cashout" label="Cash" active={path === "/cashout"} icon={<CashIcon />} />
        </div>
      </div>
    </nav>
  );
}

function Tab({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 text-[10px] font-medium transition active:scale-95 ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function WalletIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v0" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5" />
      <circle cx="16.5" cy="13" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9v0M18 15v0" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </svg>
  );
}

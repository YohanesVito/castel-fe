"use client";

import Link from "next/link";

// A single floating Pay action, mobile-first. Rendered only inside authenticated screens
// (the wallet dashboard, cash-out), so it never shows on sign-in / OTP.
export function BottomNav() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Link
        href="/pay"
        className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-primary-end px-7 py-3.5 font-semibold text-primary-foreground shadow-lg ring-4 ring-background/70 transition active:scale-95"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
          <path d="M7 12h10" />
        </svg>
        Pay QRIS
      </Link>
    </div>
  );
}

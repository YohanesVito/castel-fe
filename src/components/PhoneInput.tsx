"use client";

import { useEffect, useRef, useState } from "react";

type Country = { code: string; name: string; dial: string; flag: string };

// Bali's main visitor sources first, then a broad set. `code` (ISO) is the unique key —
// several countries share a dial code (+1 US/Canada), so we never key on `dial`.
const COUNTRIES: Country[] = [
  { code: "ID", name: "Indonesia", dial: "62", flag: "🇮🇩" },
  { code: "AU", name: "Australia", dial: "61", flag: "🇦🇺" },
  { code: "US", name: "United States", dial: "1", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", dial: "44", flag: "🇬🇧" },
  { code: "SG", name: "Singapore", dial: "65", flag: "🇸🇬" },
  { code: "MY", name: "Malaysia", dial: "60", flag: "🇲🇾" },
  { code: "CN", name: "China", dial: "86", flag: "🇨🇳" },
  { code: "JP", name: "Japan", dial: "81", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", dial: "82", flag: "🇰🇷" },
  { code: "IN", name: "India", dial: "91", flag: "🇮🇳" },
  { code: "NZ", name: "New Zealand", dial: "64", flag: "🇳🇿" },
  { code: "TH", name: "Thailand", dial: "66", flag: "🇹🇭" },
  { code: "PH", name: "Philippines", dial: "63", flag: "🇵🇭" },
  { code: "VN", name: "Vietnam", dial: "84", flag: "🇻🇳" },
  { code: "TW", name: "Taiwan", dial: "886", flag: "🇹🇼" },
  { code: "HK", name: "Hong Kong", dial: "852", flag: "🇭🇰" },
  { code: "DE", name: "Germany", dial: "49", flag: "🇩🇪" },
  { code: "NL", name: "Netherlands", dial: "31", flag: "🇳🇱" },
  { code: "FR", name: "France", dial: "33", flag: "🇫🇷" },
  { code: "IT", name: "Italy", dial: "39", flag: "🇮🇹" },
  { code: "ES", name: "Spain", dial: "34", flag: "🇪🇸" },
  { code: "CH", name: "Switzerland", dial: "41", flag: "🇨🇭" },
  { code: "SE", name: "Sweden", dial: "46", flag: "🇸🇪" },
  { code: "RU", name: "Russia", dial: "7", flag: "🇷🇺" },
  { code: "CA", name: "Canada", dial: "1", flag: "🇨🇦" },
  { code: "BR", name: "Brazil", dial: "55", flag: "🇧🇷" },
  { code: "AE", name: "United Arab Emirates", dial: "971", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", dial: "966", flag: "🇸🇦" },
  { code: "TR", name: "Turkey", dial: "90", flag: "🇹🇷" },
  { code: "IE", name: "Ireland", dial: "353", flag: "🇮🇪" },
];

/** Manages a country dial code + local digits and reports the full E.164 number upward. */
export function PhoneInput({
  onChange,
  onEnter,
  autoFocus,
}: {
  onChange: (full: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [local, setLocal] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const emit = (dial: string, digits: string) => onChange(`+${dial}${digits}`);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = filter.trim().toLowerCase();
  const shown = q
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.includes(q.replace("+", "")))
    : COUNTRIES;

  return (
    <div ref={boxRef} className="relative flex gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-3 font-[family-name:var(--font-mono)] outline-none transition focus:border-primary"
      >
        <span className="text-lg leading-none">{country.flag}</span>
        <span>+{country.dial}</span>
        <span className="text-muted-foreground">▾</span>
      </button>

      <input
        type="tel"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={local}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          setLocal(digits);
          emit(country.dial, digits);
        }}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder="81234567890"
        className="w-full min-w-0 rounded-xl border border-border bg-background px-4 py-3 font-[family-name:var(--font-mono)] outline-none focus:border-primary"
      />

      {open && (
        <div className="animate-rise absolute left-0 top-[calc(100%+0.5rem)] z-20 max-h-72 w-full overflow-hidden rounded-xl border border-border bg-background shadow-xl">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search country or code"
            className="w-full border-b border-border bg-background px-4 py-2.5 text-sm outline-none"
          />
          <ul className="max-h-56 overflow-y-auto">
            {shown.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => {
                    setCountry(c);
                    setOpen(false);
                    setFilter("");
                    emit(c.dial, local);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-muted ${
                    c.code === country.code ? "bg-muted/60" : ""
                  }`}
                >
                  <span className="text-lg leading-none">{c.flag}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="font-[family-name:var(--font-mono)] text-muted-foreground">
                    +{c.dial}
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">No match</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

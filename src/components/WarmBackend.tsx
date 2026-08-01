"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";

// Wake the (free-tier) backend as early as any page loads, so it's warm by the time the user
// reaches sign-in. Fire-and-forget: it costs nothing when nobody visits, and never blocks the UI.
export function WarmBackend() {
  useEffect(() => {
    void api.ping();
  }, []);
  return null;
}

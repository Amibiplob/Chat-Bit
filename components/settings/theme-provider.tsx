"use client";

import { useEffect } from "react";
import { subscribeTheme } from "@/lib/theme.mjs";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => subscribeTheme(() => {}), []);
  return children;
}

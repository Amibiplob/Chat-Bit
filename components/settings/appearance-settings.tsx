"use client";

import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";

export function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const storedTheme = localStorage.getItem("chatbit-theme") as Theme | null;

    if (storedTheme) {
      setTheme(storedTheme);
    }
  }, []);

  function changeTheme(value: Theme) {
    setTheme(value);
    localStorage.setItem("chatbit-theme", value);

    const root = document.documentElement;

    root.classList.remove("light", "dark");

    if (value === "light") {
      root.classList.add("light");
    }

    if (value === "dark") {
      root.classList.add("dark");
    }
  }

  const themes = [
    {
      id: "light" as const,
      label: "Light",
      description: "Use the light theme",
      icon: Sun,
    },
    {
      id: "dark" as const,
      label: "Dark",
      description: "Use the dark theme",
      icon: Moon,
    },
    {
      id: "system" as const,
      label: "System",
      description: "Follow your device preference",
      icon: Monitor,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="border-b px-5 py-6 md:px-8">
        <h2 className="text-xl font-semibold tracking-tight">Appearance</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Customize how ChatBit looks on your device.
        </p>
      </header>

      <div className="space-y-8 px-5 py-6 md:px-8">
        {/* Theme */}
        <section>
          <h3 className="text-sm font-semibold">Theme</h3>

          <p className="mt-1 text-xs text-muted-foreground">
            Select your preferred appearance.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {themes.map((item) => {
              const Icon = item.icon;
              const selected = theme === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => changeTheme(item.id)}
                  className={`relative rounded-xl border p-4 text-left transition-colors ${
                    selected
                      ? "border-blue-500 bg-blue-500/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  {selected && (
                    <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-blue-500 text-white">
                      <Check className="size-3" />
                    </span>
                  )}

                  <div
                    className={`flex size-10 items-center justify-center rounded-lg ${
                      selected
                        ? "bg-blue-500/10 text-blue-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-5" />
                  </div>

                  <p className="mt-3 text-sm font-medium">{item.label}</p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Chat appearance */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Chat appearance</h3>

            <p className="mt-1 text-xs text-muted-foreground">
              Additional preferences for conversations.
            </p>
          </div>

          <div className="divide-y rounded-xl border">
            <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium">Compact messages</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Reduce spacing between messages.
                </p>
              </div>

              <input type="checkbox" className="size-4 accent-blue-500" />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium">Show message timestamps</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Display timestamps beside messages.
                </p>
              </div>

              <input
                type="checkbox"
                defaultChecked
                className="size-4 accent-blue-500"
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}

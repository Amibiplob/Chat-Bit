"use client";

import { useState } from "react";
import { Camera, Check, Pencil } from "lucide-react";

export function ProfileSettings() {
  const [name, setName] = useState("Md Biplob Hosain");
  const [username, setUsername] = useState("biplob");
  const [bio, setBio] = useState(
    "Junior Full-Stack Developer building modern web applications.",
  );

  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);

    window.setTimeout(() => {
      setSaved(false);
    }, 2000);
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Header */}
      <header className="border-b px-5 py-6 md:px-8">
        <h2 className="text-xl font-semibold tracking-tight">Profile</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Manage your public profile information.
        </p>
      </header>

      <div className="space-y-8 px-5 py-6 md:px-8">
        {/* Avatar */}
        <section>
          <h3 className="text-sm font-semibold">Profile photo</h3>

          <p className="mt-1 text-xs text-muted-foreground">
            Choose a photo that represents you.
          </p>

          <div className="mt-4 flex items-center gap-4">
            <div className="relative">
              <div className="flex size-20 items-center justify-center rounded-full bg-blue-100 text-xl font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                MB
              </div>

              <button
                type="button"
                aria-label="Change profile photo"
                className="absolute bottom-0 right-0 flex size-7 items-center justify-center rounded-full border-2 border-background bg-blue-500 text-white shadow-sm transition-opacity hover:opacity-90"
              >
                <Camera className="size-3.5" />
              </button>
            </div>

            <div>
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
              >
                Upload photo
              </button>

              <p className="mt-1.5 text-[11px] text-muted-foreground">
                JPG, PNG or WebP. Maximum 5 MB.
              </p>
            </div>
          </div>
        </section>

        {/* Personal information */}
        <section className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold">Personal information</h3>

            <p className="mt-1 text-xs text-muted-foreground">
              This information is visible to people you communicate with.
            </p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label htmlFor="profile-name" className="text-sm font-medium">
              Display name
            </label>

            <input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <label htmlFor="profile-username" className="text-sm font-medium">
              Username
            </label>

            <div className="flex items-center rounded-lg border bg-background focus-within:ring-2 focus-within:ring-blue-500/20">
              <span className="pl-3 text-sm text-muted-foreground">@</span>

              <input
                id="profile-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label htmlFor="profile-email" className="text-sm font-medium">
              Email
            </label>

            <div className="flex gap-2">
              <input
                id="profile-email"
                value="biplob@example.com"
                disabled
                className="h-10 flex-1 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground outline-none"
              />

              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-muted"
              >
                <Pencil className="size-3.5" />
                Change
              </button>
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="profile-bio" className="text-sm font-medium">
                Bio
              </label>

              <span className="text-[11px] text-muted-foreground">
                {bio.length}/160
              </span>
            </div>

            <textarea
              id="profile-bio"
              value={bio}
              maxLength={160}
              onChange={(event) => setBio(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </section>

        {/* Save */}
        <div className="flex items-center justify-end border-t pt-5">
          <button
            type="button"
            onClick={handleSave}
            className="flex h-9 items-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {saved && <Check className="size-4" />}
            {saved ? "Saved" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

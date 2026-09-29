"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * Search field that seeds itself from the current URL, so navigating back to a
 * results page keeps the term the user typed.
 */
export const SearchBar = () => {
  const router = useRouter();
  const params = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const [seededFrom, setSeededFrom] = useState(urlQuery);

  // Re-sync during render rather than in an effect, so the input never paints
  // a stale term for a frame after navigation.
  if (seededFrom !== urlQuery) {
    setSeededFrom(urlQuery);
    setValue(urlQuery);
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    const next = new URLSearchParams();
    if (trimmed) next.set("q", trimmed);

    const category = params.get("category");
    if (category) next.set("category", category);

    const qs = next.toString();
    router.push(qs ? `/browse?${qs}` : "/browse");
  };

  return (
    <form role="search" onSubmit={submit} className="relative">
      <label htmlFor="site-search" className="sr-only">
        Search the collection
      </label>
      <input
        id="site-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search artists, titles, places…"
        className="w-full rounded-full border border-border bg-surface py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
      >
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
        <path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </form>
  );
};

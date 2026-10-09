"use client";

import Link from "next/link";
import { useState } from "react";
import { SearchBar } from "./SearchBar";

const NAV = [
  { href: "/browse?category=painting", label: "Paintings" },
  { href: "/browse?category=sculpture", label: "Sculptures" },
  { href: "/browse?category=artifact", label: "Artifacts" },
  { href: "/browse?category=monument", label: "Monuments" },
  { href: "/browse", label: "All works" },
] as const;

export const SiteHeader = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header sticky top-0 z-40 backdrop-blur">
      <div className="site-header-inner mx-auto flex max-w-[1600px] items-center gap-8 px-6 py-4">
        <Link href="/" className="site-brand group flex shrink-0 items-baseline gap-2" onClick={closeMenu}>
          <span className="font-serif text-lg tracking-tight">
            Digital Art Museum
          </span>
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-accent transition group-hover:scale-150"
          />
        </Link>

        <nav aria-label="Collections" className="site-navigation hidden flex-1 xl:block">
          <ul className="flex items-center gap-5 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="site-nav-link transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="site-search ml-auto hidden w-full max-w-sm xl:block">
          <SearchBar />
        </div>

        <button
          type="button"
          className="site-menu-toggle ml-auto flex size-10 shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent xl:hidden"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden className="grid w-5 gap-1.25">
            <span
              className={`h-px w-5 bg-current transition-transform ${
                menuOpen ? "translate-y-1.5 rotate-45" : ""
              }`}
            />
            <span className={`h-px w-5 bg-current transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
            <span
              className={`h-px w-5 bg-current transition-transform ${
                menuOpen ? "-translate-y-1.5 -rotate-45" : ""
              }`}
            />
          </span>
        </button>
      </div>

      {menuOpen && (
        <div id="mobile-navigation" className="border-t border-border xl:hidden">
          <div className="mx-auto max-w-[1600px] px-6 py-4">
            <nav aria-label="Mobile collections">
              <ul className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={closeMenu}
                      className="text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-5">
              <SearchBar onNavigate={closeMenu} />
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

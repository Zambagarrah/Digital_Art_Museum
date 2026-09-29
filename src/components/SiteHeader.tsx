import Link from "next/link";
import { SearchBar } from "./SearchBar";

const NAV = [
  { href: "/browse?category=painting", label: "Paintings" },
  { href: "/browse?category=sculpture", label: "Sculptures" },
  { href: "/browse?category=monument", label: "Monuments" },
  { href: "/browse", label: "All works" },
] as const;

export const SiteHeader = () => (
  <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
      <Link href="/" className="group flex items-baseline gap-2">
        <span className="font-serif text-lg tracking-tight text-foreground">
          Digital Art Museum
        </span>
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-accent transition group-hover:scale-150"
        />
      </Link>

      <nav aria-label="Collections" className="order-3 w-full md:order-2 md:w-auto">
        <ul className="flex items-center gap-5 text-sm">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-muted transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="order-2 ml-auto w-full max-w-sm md:order-3">
        <SearchBar />
      </div>
    </div>
  </header>
);

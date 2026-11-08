"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "../login/actions";

const LINKS = [
  { href: "/admin", label: "Reports", exact: true },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav({ restaurantName, staffName, role }: { restaurantName: string; staffName: string; role: string }) {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));
  return (
    <aside className="border-b border-sand-deep bg-sand lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-5 py-4 lg:block lg:py-6">
        <div>
          <p className="font-extrabold tracking-tight">{restaurantName}</p>
          <p className="text-sm text-ink-muted">{staffName}, {role}</p>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Admin">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active(l.href, l.exact) ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2.5 font-semibold ${active(l.href, l.exact) ? "bg-palm text-white" : "text-ink hover:bg-sand-deep"}`}
          >
            {l.label}
          </Link>
        ))}
        <Link href="/kitchen" className="whitespace-nowrap rounded-lg px-3 py-2.5 font-semibold text-ink hover:bg-sand-deep">Kitchen screen</Link>
      </nav>
      <form action={signOut} className="hidden px-3 pb-5 lg:mt-auto lg:block">
        <button type="submit" className="w-full rounded-lg px-3 py-2.5 text-left font-semibold text-ink-muted hover:bg-sand-deep">Sign out</button>
      </form>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartNoAxesCombined,
  ChartPie,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  House,
  Plane,
  PiggyBank,
  Sparkles,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";

const primaryNavigation: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/savings", label: "Savings", icon: PiggyBank },
  { href: "/budget", label: "Budget", icon: ChartPie },
  { href: "/debt", label: "Debt", icon: CreditCard },
  { href: "/travel", label: "Travel", icon: Plane },
];

const secondaryNavigation: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
  ...(process.env.NODE_ENV !== "production"
    ? [{ href: "/assistant", label: "Iponly AI", icon: Sparkles }]
    : []),
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function NavLink({
  href,
  label,
  icon: Icon,
  mobile = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`${mobile ? "mobile-nav-link" : "sidebar-link"}${active ? " is-active" : ""}`}
      href={href}
    >
      <Icon aria-hidden="true" size={19} strokeWidth={active ? 2.2 : 1.8} />
      <span>{label}</span>
    </Link>
  );
}

export function AppShell({
  children,
  profile,
  theme,
}: {
  children: ReactNode;
  profile: { name: string; email: string };
  theme: "light" | "dark" | "system";
}) {
  const initials = profile.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="app-shell" data-theme={theme}>
      <aside aria-label="Main navigation" className="sidebar">
        <Link aria-label="Iponly home" className="brand-lockup" href="/">
          <span aria-hidden="true" className="brand-mark"><CircleDollarSign size={23} strokeWidth={1.8} /></span>
          <span className="brand-copy"><strong>Iponly</strong><small>Ipon. Budget. Bayad. Gala.</small></span>
        </Link>

        <p className="nav-caption">Your money</p>
        <nav className="sidebar-nav">
          {primaryNavigation.map((item) => <NavLink key={item.href} {...item} />)}
        </nav>

        <div className="sidebar-spacer" />
        <p className="nav-caption nav-caption-tools">Plan & manage</p>
        <nav aria-label="More navigation" className="sidebar-nav">
          {secondaryNavigation.map((item) => <NavLink key={item.href} {...item} />)}
        </nav>

        <Link className="sidebar-profile" href="/settings">
          <span aria-hidden="true" className="profile-avatar">{initials}</span>
          <span className="profile-copy"><strong>{profile.name}</strong><small>{profile.email}</small></span>
          <ChevronRight aria-hidden="true" size={16} />
        </Link>
        <LogoutButton compact />
      </aside>

      <div className="workspace">
        <header className="topbar">
          <Link aria-label="Iponly home" className="mobile-brand" href="/">
            <span aria-hidden="true" className="brand-mark"><CircleDollarSign size={21} strokeWidth={1.8} /></span>
            <strong>Iponly</strong>
          </Link>
          <div className="topbar-spacer" />
          {process.env.NODE_ENV !== "production" ? (
            <Link aria-label="Ask Iponly AI" className="assistant-quick-link" href="/assistant">
              <Sparkles aria-hidden="true" size={17} />
              <span>Ask AI</span>
            </Link>
          ) : null}
          <Link aria-label={`Settings for ${profile.name}`} className="topbar-profile" href="/settings">
            <span aria-hidden="true" className="profile-avatar">{initials}</span>
          </Link>
          <LogoutButton iconOnly />
        </header>

        <main className="main-content" id="main-content">{children}</main>
        <footer className="site-footer app-site-footer">
          <span>All Rights Reserved 2026 | Developed by PNase</span>
        </footer>
      </div>

      <nav aria-label="Primary navigation" className="bottom-navigation">
        {primaryNavigation.map((item) => <NavLink key={item.href} {...item} mobile />)}
      </nav>
    </div>
  );
}
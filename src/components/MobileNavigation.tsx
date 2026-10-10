"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./AppShell";

interface MobileNavigationProps {
  navItems: NavItem[];
  roleLabel: string;
  userLabel: string;
}

export function MobileNavigation({ navItems, roleLabel, userLabel }: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="mobile-primary-navigation"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-pitch-700 text-chalk-50 transition-colors hover:bg-pitch-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/60"
          />
          <nav
            id="mobile-primary-navigation"
            aria-label="Main navigation"
            className="fixed inset-y-0 left-0 z-50 flex w-[min(19rem,85vw)] flex-col border-r border-pitch-700 bg-pitch-900 px-4 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between gap-3 border-b border-pitch-700 px-2 pb-5">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-pitch-500">StatBomb</p>
                <p className="mt-1 font-display text-lg text-chalk-50">Console</p>
                <p className="mt-2 max-w-[13rem] truncate text-sm text-chalk-200">{userLabel}</p>
                <p className="font-mono text-xs uppercase tracking-wide text-pitch-500">{roleLabel}</p>
              </div>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-chalk-200 hover:bg-pitch-800 hover:text-chalk-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-3 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                      active
                        ? "bg-pitch-800 font-semibold text-chalk-50"
                        : "text-chalk-200 hover:bg-pitch-800 hover:text-chalk-50"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <p className="border-t border-pitch-700 px-2 pt-4 text-xs text-pitch-500">StatBomb Console</p>
          </nav>
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { NavItem } from "./AppShell";
import { NotificationBell } from "./NotificationBell";

interface MobileNavProps {
  roleLabel: string;
  userLabel: string;
  navItems: NavItem[];
  notificationsHref: string;
  unreadCount: number;
}

export function MobileNav({
  roleLabel,
  userLabel,
  navItems,
  notificationsHref,
  unreadCount,
}: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <>
      <button
        type="button"
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={isOpen}
        aria-controls="mobile-navigation"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-pitch-700 text-chalk-200 transition-colors hover:border-clock-amber hover:text-chalk-50 lg:hidden"
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={closeMenu}
            className="absolute inset-0 h-full w-full bg-black/60"
          />
          <aside
            id="mobile-navigation"
            aria-label="Main navigation"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-pitch-700 bg-pitch-900 px-4 py-5 shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between gap-3 px-2">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-pitch-500">StatBomb</p>
                <p className="mt-1 font-display text-lg text-chalk-50">Console</p>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell href={notificationsHref} unreadCount={unreadCount} />
                <button
                  type="button"
                  onClick={closeMenu}
                  aria-label="Close navigation menu"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-pitch-700 text-chalk-200 hover:border-clock-amber hover:text-chalk-50"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            </div>

            <nav className="flex flex-1 flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="rounded-[8px] px-3 py-3 text-sm text-chalk-200 transition-colors hover:bg-pitch-800 hover:text-chalk-50"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-6 border-t border-pitch-700 px-2 pt-4">
              <p className="truncate text-sm text-chalk-50">{userLabel}</p>
              <p className="font-mono text-xs uppercase tracking-wide text-pitch-500">{roleLabel}</p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

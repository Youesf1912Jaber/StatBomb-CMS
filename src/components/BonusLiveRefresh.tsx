"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refreshes the Admin Bonus server component while it is open so edits made
 * directly in Google Sheets appear without leaving and re-entering the page.
 * The sheet data cache is kept short to avoid a Google Sheets API request on
 * every browser refresh.
 */
export function BonusLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => {
      router.refresh();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [router]);

  return (
    <p className="text-xs text-chalk-300" aria-live="polite">
      Live sheet sync: checking for updates every 5 seconds.
    </p>
  );
}

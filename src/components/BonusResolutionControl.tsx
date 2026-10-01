"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBonusResolution, type BonusResolutionInput } from "@/lib/bonus/actions";

interface BonusResolutionControlProps {
  bonus: Omit<BonusResolutionInput, "resolution">;
  resolution: "Valid" | "Invalid" | null;
}

export function BonusResolutionControl({ bonus, resolution }: BonusResolutionControlProps) {
  const router = useRouter();
  const [value, setValue] = useState<string>(resolution ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    setValue(next);
    setError(null);
    const nextResolution = next === "" ? null : (next as "Valid" | "Invalid");
    startTransition(async () => {
      const result = await setBonusResolution({ ...bonus, resolution: nextResolution });
      if (result.error) {
        setError(result.error);
        setValue(resolution ?? "");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <select
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        disabled={isPending}
        className="rounded-[8px] border border-pitch-700 bg-pitch-900 px-2 py-1.5 text-sm text-chalk-50 disabled:opacity-60"
      >
        <option value="">Pending</option>
        <option value="Valid">Valid</option>
        <option value="Invalid">Invalid</option>
      </select>
      {error && (
        <p role="alert" className="text-xs text-clock-red">
          {error}
        </p>
      )}
    </div>
  );
}

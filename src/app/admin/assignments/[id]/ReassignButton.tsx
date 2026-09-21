"use client";

import { useState } from "react";
import { ReassignModal } from "@/components/ReassignModal";

interface CollectorOption {
  id: string;
  full_name: string | null;
  email: string;
}

interface ReassignButtonProps {
  assignmentId: string;
  currentCollectorId: string;
  currentCollectorName: string;
  availableCollectors: CollectorOption[];
}

export function ReassignButton({
  assignmentId,
  currentCollectorId,
  currentCollectorName,
  availableCollectors,
}: ReassignButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20"
      >
        Reassign
      </button>
      {isOpen && (
        <ReassignModal
          assignmentId={assignmentId}
          currentCollectorId={currentCollectorId}
          currentCollectorName={currentCollectorName}
          availableCollectors={availableCollectors}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

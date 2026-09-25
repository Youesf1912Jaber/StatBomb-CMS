"use client";

import { useState } from "react";
import { EditDistributionDetailsModal } from "@/components/EditDistributionDetailsModal";

interface EditDistributionDetailsButtonProps {
  assignmentId: string;
  shiftDate: string | null;
  officialWebsiteUrl: string | null;
}

export function EditDistributionDetailsButton({
  assignmentId,
  shiftDate,
  officialWebsiteUrl,
}: EditDistributionDetailsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20"
      >
        Edit Distribution Details
      </button>
      {isOpen && (
        <EditDistributionDetailsModal
          assignmentId={assignmentId}
          shiftDate={shiftDate}
          officialWebsiteUrl={officialWebsiteUrl}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

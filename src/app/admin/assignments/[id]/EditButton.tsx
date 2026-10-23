"use client";

import { useState } from "react";
import { EditAssignmentModal } from "@/components/EditAssignmentModal";
import type { AssignmentRow } from "@/types/database.types";
import type { TeamSheetCollector } from "@/lib/sync/google-sheets";

interface EditButtonProps {
  assignment: AssignmentRow;
  matchExternalId: string;
  availableCollectors: TeamSheetCollector[];
}

export function EditButton({ assignment, matchExternalId, availableCollectors }: EditButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20"
      >
        Edit
      </button>
      {isOpen && (
        <EditAssignmentModal
          assignment={assignment}
          matchExternalId={matchExternalId}
          availableCollectors={availableCollectors}
          onClose={() => setIsOpen(false)}
          onSuccess={() => {
            // Revalidation happens via the server action
          }}
        />
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { EditAssignmentModal } from "@/components/EditAssignmentModal";
import type { AssignmentRow } from "@/types/database.types";

interface EditButtonProps {
  assignment: AssignmentRow;
}

export function EditButton({ assignment }: EditButtonProps) {
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
          onClose={() => setIsOpen(false)}
          onSuccess={() => {
            // Revalidation happens via the server action
          }}
        />
      )}
    </>
  );
}

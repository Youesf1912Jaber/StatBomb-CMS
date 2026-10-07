export type AddAssignmentFeedbackPayload = {
  assignments?: Array<{ id: string; task: string; half: string }>;
  warnings?: string[];
  overTargetSheetFailed?: boolean;
};

export type AddAssignmentFeedback = {
  successMessage: string;
  warnings: string[];
};

export function formatAddAssignmentFeedback(payload: AddAssignmentFeedbackPayload): AddAssignmentFeedback {
  const details = (payload.assignments ?? [])
    .map((assignment) => `${assignment.task} · ${assignment.half} · ${assignment.id}`)
    .join("; ");
  const warnings = [...(payload.warnings ?? [])];
  if (payload.overTargetSheetFailed === true && warnings.length === 0) {
    warnings.push(
      "Over Target was saved in the database, but writing the Google Sheet row failed. The Distribution assignment was not rolled back. Retry the sheet write from Admin Over Target."
    );
  }
  return {
    successMessage: `Assignment added successfully.${details ? ` ${details}` : ""}`,
    warnings,
  };
}

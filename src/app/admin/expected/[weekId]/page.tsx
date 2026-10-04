import { ExpectedWeekClient } from "./ExpectedWeekClient";

export const runtime = "nodejs";

export default function AdminExpectedWeekPage({
  params,
}: {
  params: { weekId: string };
}) {
  return <ExpectedWeekClient weekId={params.weekId} />;
}

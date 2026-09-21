export default function SyncLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-56 animate-pulse rounded bg-pitch-800" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-pitch-800" />
      </div>
      <div className="h-28 animate-pulse rounded-card border border-pitch-700 bg-pitch-900" />
      <div className="h-64 animate-pulse rounded-card border border-pitch-700 bg-pitch-900" />
    </div>
  );
}

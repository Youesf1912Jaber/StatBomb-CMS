import "server-only";

import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/** Acquire a cross-instance database lease shared by cache sync and Apply. */
export async function acquireMatchMasterSyncLock() {
  const token = randomUUID();
  const service = createServiceRoleClient() as unknown as RpcClient;
  const { data, error } = await service.rpc("acquire_match_master_sync_lock", { p_token: token });
  if (error) throw new Error(`Unable to acquire Match Master lock: ${error.message}`);
  if (data !== true) return null;
  return { token };
}

/** Release only the lease owned by this request. */
export async function releaseMatchMasterSyncLock(lock: { token: string }) {
  const service = createServiceRoleClient() as unknown as RpcClient;
  const { error } = await service.rpc("release_match_master_sync_lock", { p_token: lock.token });
  if (error) throw new Error(`Unable to release Match Master lock: ${error.message}`);
}

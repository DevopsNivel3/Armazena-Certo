import { MAX_SYNC_ATTEMPTS } from '../config';
import type { SyncReport } from '../types';
import { ApiError, submitCount } from './api';
import { getQueue, markQueueItem, removeQueueItem } from './database';

let syncPromise: Promise<SyncReport> | null = null;

export function syncCounts(token: string, inventoryId?: number) {
  if (syncPromise) return syncPromise;
  syncPromise = runSync(token, inventoryId).finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

async function runSync(token: string, inventoryId?: number): Promise<SyncReport> {
  const queue = await getQueue(inventoryId);
  let sent = 0;
  let authRequired = false;

  for (const item of queue) {
    if (item.status === 'blocked') continue;
    try {
      await submitCount(token, item);
      await removeQueueItem(item.localId);
      sent += 1;
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError('Falha de sincronização', 0);
      const attempts = item.attempts + 1;
      if (apiError.status === 401 || apiError.status === 403) {
        authRequired = apiError.status === 401;
        await markQueueItem(item.localId, apiError.status === 401 ? 'auth_required' : 'blocked', attempts, apiError.message);
        if (apiError.status === 401) break;
      } else {
        const retryable = apiError.status === 0 || apiError.status === 408 || apiError.status === 429 || apiError.status >= 500;
        const blocked = !retryable || attempts >= MAX_SYNC_ATTEMPTS;
        await markQueueItem(item.localId, blocked ? 'blocked' : 'retrying', attempts, apiError.message);
      }
    }
  }

  const remaining = await getQueue(inventoryId);
  return {
    sent,
    pending: remaining.filter((item) => item.status !== 'blocked').length,
    blocked: remaining.filter((item) => item.status === 'blocked').length,
    authRequired
  };
}

import { useSyncExternalStore } from 'react';
import { getEnvVersion, subscribeEnvChanges } from '@/config/envConfig';

export function useEnvVersion(): number {
  return useSyncExternalStore(subscribeEnvChanges, getEnvVersion, getEnvVersion);
}
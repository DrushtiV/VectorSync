import { useCallback, useSyncExternalStore } from 'react';
import { CRDTCanvasStore, ConnectionStatus } from '../crdt/CRDTStore';
import { CanvasNode, PermissionRule, PermissionRole, PresenceState } from '../shared/types';

export function useNodes(store: CRDTCanvasStore): CanvasNode[] {
  const subscribe = useCallback((cb: () => void) => store.subscribe(cb), [store]);
  const getSnapshot = useCallback(() => store.getNodes(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function usePeers(store: CRDTCanvasStore): PresenceState[] {
  const subscribe = useCallback((cb: () => void) => store.subscribe(cb), [store]);
  const getSnapshot = useCallback(() => store.getPeers(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useConnectionStatus(store: CRDTCanvasStore): ConnectionStatus {
  const subscribe = useCallback((cb: () => void) => store.subscribeConnection(cb), [store]);
  const getSnapshot = useCallback(() => store.getStatus(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useRole(store: CRDTCanvasStore): PermissionRole {
  const subscribe = useCallback((cb: () => void) => store.subscribe(cb), [store]);
  const getSnapshot = useCallback(() => store.getRole(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function usePermissions(store: CRDTCanvasStore): PermissionRule[] {
  const subscribe = useCallback((cb: () => void) => store.subscribe(cb), [store]);
  const getSnapshot = useCallback(() => store.getPermissions(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
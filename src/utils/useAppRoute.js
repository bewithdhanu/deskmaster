import { useMemo, useSyncExternalStore } from 'react'
import { parseRoute, subscribe } from './appRoute'

function getHashSnapshot() {
  return window.location.hash || '#'
}

export function useAppRoute() {
  const hash = useSyncExternalStore(subscribe, getHashSnapshot, () => '#')
  return useMemo(() => parseRoute(), [hash])
}

import { useCallback, useRef, useState } from 'react';

export type LayeredStopsState = 'idle' | 'watching' | 'replacing' | 'confirmed' | 'aborted';
export type LayeredStopsLayer = 'L1' | 'L2' | 'L3';

interface UseLayeredStopsMachineParams {
  isPositionOpen: () => boolean;
}

export function useLayeredStopsMachine({ isPositionOpen }: UseLayeredStopsMachineParams) {
  const [state, setState] = useState<LayeredStopsState>('idle');
  const [layer, setLayer] = useState<LayeredStopsLayer>('L1');
  const abortedRef = useRef(false);

  const startWatching = useCallback((nextLayer: LayeredStopsLayer) => {
    if (abortedRef.current) return;
    setLayer(nextLayer);
    setState('watching');
  }, []);

  const startReplacing = useCallback((nextLayer: LayeredStopsLayer) => {
    if (abortedRef.current) return false;
    if (!isPositionOpen()) {
      abortedRef.current = true;
      setLayer(nextLayer);
      setState('aborted');
      return false;
    }
    setLayer(nextLayer);
    setState('replacing');
    return true;
  }, [isPositionOpen]);

  const confirmReplacement = useCallback((nextLayer: LayeredStopsLayer) => {
    if (abortedRef.current) return;
    setLayer(nextLayer);
    setState('confirmed');
  }, []);

  const abort = useCallback((nextLayer?: LayeredStopsLayer) => {
    abortedRef.current = true;
    if (nextLayer) {
      setLayer(nextLayer);
    }
    setState('aborted');
  }, []);

  const reset = useCallback((nextLayer: LayeredStopsLayer = 'L1') => {
    abortedRef.current = false;
    setLayer(nextLayer);
    setState('idle');
  }, []);

  return {
    state,
    layer,
    startWatching,
    startReplacing,
    confirmReplacement,
    abort,
    reset,
    isAborted: abortedRef,
  };
}

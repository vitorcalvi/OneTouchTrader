import { useState, useCallback } from 'react';

const KEY = 'lean.settings.overrides.v1';

export function useSettingsOverrides() {
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      return {};
    }
  });

  const set = useCallback((k: string, v: string | null) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (v === null || v === '') {
        delete next[k];
      } else {
        next[k] = v;
      }
      localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('lean:settings-changed', { detail: next }));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setOverrides({});
    window.dispatchEvent(new CustomEvent('lean:settings-changed', { detail: {} }));
  }, []);

  return { overrides, set, reset };
}
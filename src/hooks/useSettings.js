import { useState, useEffect, useCallback } from 'react';

export const SETTINGS_DEFAULT = {
  company: {
    name:        'Knowledgebase',
    namePrimary: 'Knowledge',
    nameAccent:  'base',
    industry:    'Knowledge Management',
    initials:    'K',
    showIcon:    true,
    showName:    true,
  },
};

export function useSettings() {
  const [settings, setSettings] = useState(SETTINGS_DEFAULT);
  const [loading,  setLoading]  = useState(true);
  const [savedAt,  setSavedAt]  = useState(null);

  useEffect(() => {
    if (!window.electronAPI) { setLoading(false); return; }
    window.electronAPI.readSettings()
      .then(s => { if (s) setSettings(deepMerge(SETTINGS_DEFAULT, s)); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const save = useCallback(async (partial) => {
    const merged = deepMerge(settings, partial);
    setSettings(merged);
    if (window.electronAPI) await window.electronAPI.writeSettings(merged);
    setSavedAt(Date.now());
    return merged;
  }, [settings]);

  return { settings, loading, save, savedAt };
}

function deepMerge(base, overrides) {
  const result = { ...base };
  for (const key of Object.keys(overrides)) {
    if (
      overrides[key] !== null &&
      typeof overrides[key] === 'object' &&
      !Array.isArray(overrides[key]) &&
      typeof base[key] === 'object'
    ) {
      result[key] = deepMerge(base[key] || {}, overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

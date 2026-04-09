import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { SAMPLE_PAPERS } from '../pages/knowledge-base/LiteratureTab';

const KnowledgeBaseContext = createContext({});

export function KnowledgeBaseProvider({ children }) {
  const [papers, setPapers] = useState(SAMPLE_PAPERS);
  const [focusPaperId, setFocusPaperId] = useState(null);
  const persistReady = useRef(false);

  // Load persisted papers on mount
  useEffect(() => {
    window.electronAPI?.readPapers?.()
      .then(saved => {
        if (Array.isArray(saved) && saved.length > 0) setPapers(saved);
      })
      .catch(() => {})
      .finally(() => { persistReady.current = true; });
  }, []);

  // Persist whenever papers change
  useEffect(() => {
    if (!persistReady.current) return;
    window.electronAPI?.writePapers?.(papers);
  }, [papers]);

  // Navigate to another KB page (fires a CustomEvent that AppShell listens to)
  const navigate = ({ tab, paperId }) => {
    if (tab === 'literature' && paperId) setFocusPaperId(paperId);
    window.dispatchEvent(new CustomEvent('kb:navigate', { detail: { tab } }));
  };

  return (
    <KnowledgeBaseContext.Provider value={{ papers, setPapers, focusPaperId, navigate }}>
      {children}
    </KnowledgeBaseContext.Provider>
  );
}

export function useKnowledgeBase() {
  return useContext(KnowledgeBaseContext);
}

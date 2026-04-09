import AppShell from './app-shell/AppShell';
import { KB_CONFIG } from './app-shell/navVariants';
import { KnowledgeBaseProvider } from './contexts/KnowledgeBaseContext';

export default function App() {
  return (
    <KnowledgeBaseProvider>
      <AppShell
        groups={KB_CONFIG.groups}
        standaloneItems={KB_CONFIG.standaloneItems}
        defaultActiveId={KB_CONFIG.defaultActiveId}
      />
    </KnowledgeBaseProvider>
  );
}

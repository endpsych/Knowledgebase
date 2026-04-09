import { useKnowledgeBase } from '../../contexts/KnowledgeBaseContext';
import LiteratureTab from '../knowledge-base/LiteratureTab';
export default function LiteraturePage() {
  const { papers, setPapers, focusPaperId } = useKnowledgeBase();
  return <LiteratureTab papers={papers} onPapersChange={setPapers} focusPaperId={focusPaperId} />;
}

import { useKnowledgeBase } from '../../contexts/KnowledgeBaseContext';
import ParsingTab from '../knowledge-base/ParsingTab';
export default function ParsingPage() {
  const { papers, setPapers, navigate } = useKnowledgeBase();
  return <ParsingTab papers={papers} onPapersChange={setPapers} onNavigate={navigate} />;
}

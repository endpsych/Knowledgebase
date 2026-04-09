import { useKnowledgeBase } from '../../contexts/KnowledgeBaseContext';
import IngestionPipelineTab from '../knowledge-base/IngestionPipelineTab';
export default function IngestionPipelinePage() {
  const { papers, setPapers, navigate } = useKnowledgeBase();
  return <IngestionPipelineTab papers={papers} onPapersChange={setPapers} onNavigate={navigate} />;
}

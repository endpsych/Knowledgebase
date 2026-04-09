import { useKnowledgeBase } from '../../contexts/KnowledgeBaseContext';
import KnowledgeStoreTab from '../knowledge-base/KnowledgeStoreTab';
export default function KnowledgeStorePage() {
  const { papers } = useKnowledgeBase();
  return <KnowledgeStoreTab papers={papers} />;
}

import { useKnowledgeBase } from '../../contexts/KnowledgeBaseContext';
import OntologySchemaTab from '../knowledge-base/OntologySchemaTab';
export default function OntologyPage() {
  const { papers } = useKnowledgeBase();
  return <OntologySchemaTab papers={papers} />;
}

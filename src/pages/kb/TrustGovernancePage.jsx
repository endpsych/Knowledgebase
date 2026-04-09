import { useKnowledgeBase } from '../../contexts/KnowledgeBaseContext';
import TrustGovernanceTab from '../knowledge-base/TrustGovernanceTab';
export default function TrustGovernancePage() {
  const { papers } = useKnowledgeBase();
  return <TrustGovernanceTab papers={papers} />;
}

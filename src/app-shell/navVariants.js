import {
  Zap, BookOpen, FileSearch, Database,
  Boxes, Workflow, FileText, ShieldCheck,
} from 'lucide-react';
import WorkflowsPage        from '../pages/kb/WorkflowsPage';
import LiteraturePage       from '../pages/kb/LiteraturePage';
import ParsingPage          from '../pages/kb/ParsingPage';
import KnowledgeStorePage   from '../pages/kb/KnowledgeStorePage';
import OntologyPage         from '../pages/kb/OntologyPage';
import IngestionPipelinePage from '../pages/kb/IngestionPipelinePage';
import DocumentationPage    from '../pages/kb/DocumentationPage';
import TrustGovernancePage  from '../pages/kb/TrustGovernancePage';

export const KB_CONFIG = {
  groups: [
    {
      id: 'knowledge-base',
      label: 'Knowledge Base',
      items: [
        { id: 'literature', label: 'Literature',         icon: BookOpen,    page: LiteraturePage       },
        { id: 'parsing',    label: 'Parsing',            icon: FileSearch,  page: ParsingPage          },
        { id: 'store',      label: 'Knowledge Store',    icon: Database,    page: KnowledgeStorePage   },
        { id: 'ontology',   label: 'Ontology & Schema',  icon: Boxes,       page: OntologyPage         },
        { id: 'ingestion',  label: 'Ingestion Pipeline', icon: Workflow,    page: IngestionPipelinePage },
        { id: 'docs',       label: 'Documentation',      icon: FileText,    page: DocumentationPage    },
        { id: 'governance', label: 'Trust & Governance', icon: ShieldCheck, page: TrustGovernancePage  },
        { id: 'workflows',  label: 'Workflows',          icon: Zap,         page: WorkflowsPage        },
      ],
    },
  ],
  standaloneItems: [],
  defaultActiveId: 'literature',
};

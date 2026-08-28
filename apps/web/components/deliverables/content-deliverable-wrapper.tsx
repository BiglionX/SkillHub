// Server Component 桥：把 Prisma 查到的数据转给 client component
import ContentDeliverable from './content-deliverable';

interface InputParam {
  name: string;
  label: string;
  type: 'text' | 'select' | 'textarea';
  default?: string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
}

interface Props {
  slug: string;
  skillName: string;
  llmConfig: {
    model?: string;
    system_prompt?: string;
    input_schema?: { params?: InputParam[] };
  };
}

export default function ContentDeliverableWrapper({ slug, skillName, llmConfig }: Props) {
  return <ContentDeliverable slug={slug} skillName={skillName} llmConfig={llmConfig} />;
}
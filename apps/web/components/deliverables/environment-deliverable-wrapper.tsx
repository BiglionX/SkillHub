// Server Component 桥：M2 新增 installCommand 参数
import EnvironmentDeliverable from './environment-deliverable';

interface Props {
  slug: string;
  skillName: string;
  targetSoftware?: string;
  installType?: string;
  installCommand?: string;
}

export default function EnvironmentDeliverableWrapper({
  slug,
  skillName,
  targetSoftware,
  installType,
  installCommand,
}: Props) {
  return (
    <EnvironmentDeliverable
      slug={slug}
      skillName={skillName}
      targetSoftware={targetSoftware}
      installType={installType}
      installCommand={installCommand}
    />
  );
}
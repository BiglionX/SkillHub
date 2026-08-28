// Server Component 桥
import OAuthDeliverable from './oauth-deliverable';

interface Props {
  slug: string;
  skillName: string;
  oauthProviders?: Array<{ id: string; name: string; logo?: string }>;
}

export default function OAuthDeliverableWrapper({ slug, skillName, oauthProviders }: Props) {
  return <OAuthDeliverable slug={slug} skillName={skillName} oauthProviders={oauthProviders} />;
}
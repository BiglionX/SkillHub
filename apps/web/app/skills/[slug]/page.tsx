import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import FeedbackButton from '@/components/skills/FeedbackButton';
// v3 M1：三形态 Deliverable
import ContentDeliverableWrapper from '@/components/deliverables/content-deliverable-wrapper';
import EnvironmentDeliverableWrapper from '@/components/deliverables/environment-deliverable-wrapper';
import OAuthDeliverableWrapper from '@/components/deliverables/oauth-deliverable-wrapper';

// Subcategory label mapping
interface LlmConfigPayload {
  model?: string;
  system_prompt?: string;
  // v2.0.7+：Prisma 端 llmConfig.input_schema.params 是 JSON 字段（unknown 形状），
  // ContentDeliverableWrapper 期望 InputParam[]；用 any[] 让两侧都能编译通过（运行时由 component 自行校验）。
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  input_schema?: { params?: any[] };
  oauth_providers?: Array<{ id: string; name: string; logo?: string }>;
}

interface ExecutionConfigPayload {
  target_software?: string;
  install_type?: string;
  install_command?: string;
}

interface RelatedSkill {
  id: string;
  name: string;
  slug: string;
  description: string;
  similarity?: number;
}

const subcategoryLabels: Record<string, string> = {
  'ai_agent': 'AI代理',
  'llm_tools': 'LLM工具',
  'ml_framework': 'ML框架',
  'computer_vision': '计算机视觉',
  'speech_audio': '语音处理',
  'workflow_automation': '工作流自动化',
  'rpa_bot': 'RPA机器人',
  'task_scheduling': '任务调度',
  'database': '数据库',
  'data_viz': '数据可视化',
  'web_scraping': '网络爬虫',
  'mobile_app': '移动应用',
  'frontend': '前端开发',
  'ecommerce': '电商',
  'dev_tools': '开发工具',
  'testing': '测试工具',
  'documentation': '文档工具',
  'cli_tools': 'CLI工具',
};

function getSubcategoryLabel(subcategory: string): string {
  return subcategoryLabels[subcategory] || subcategory;
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const skill = await prisma.skill.findUnique({
    where: { slug },
  });

  if (!skill) {
    return {
      title: 'Skill 不存在',
    };
  }

  return {
    title: skill.name,
    description: skill.description,
    openGraph: {
      title: `${skill.name} - SkillHub`,
      description: skill.description || '浏览 AI Agent 技能详情',
      url: `/skills/${skill.slug}`,
      type: 'article',
      images: [
        {
          url: '/skillhub.png',
          width: 1200,
          height: 630,
          alt: skill.name,
        },
      ],
    },
    twitter: {
      title: `${skill.name} - SkillHub`,
      description: skill.description || '浏览 AI Agent 技能详情',
      images: ['/skillhub.png'],
    },
  };
}

export default async function PublicSkillDetailPage({ params }: Props) {
  const { slug } = await params;

  const skill = await prisma.skill.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      category: true,
      subcategory: true,
      confidence: true,
      tags: true,
      downloadCount: true,
      rating: true,
      reviewCount: true,
      readme: true,
      repositoryUrl: true,
      packageUrl: true,
      createdAt: true,
      // v3 M1：交付物分类 + LLM 配置
      deliveryCategory: true,
      llmConfig: true,
      // v3 M1：执行配置（A 类的 install_type 在这里）
      executionConfig: true,
      author: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
      namespace: {
        select: {
          id: true,
          slug: true,
          name: true,
        },
      },
      versions: {
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
      },
    },
  });

  if (!skill) {
    notFound();
  }

  // 获取相关Skills（基于语义搜索）
  let relatedSkills: RelatedSkill[] = [];
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/skills/${skill.id}/related?limit=5`,
      { cache: 'no-store' }
    );

    if (response.ok) {
      const data = (await response.json()) as { relatedSkills?: RelatedSkill[] };
      relatedSkills = data.relatedSkills || [];
    }
  } catch (error) {
    console.error('Failed to fetch related skills:', error);
  }

  return (
    // v2.0.7+：plan §3.3 + glass.css。整页深色玻璃画布 + 顶部玻璃 sticky header。
    <div className="glass-canvas-bg min-h-screen">
      {/* Header */}
      <div className="glass-card-soft sticky top-0 z-10 rounded-none border-x-0 border-t-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href="/skills"
            className="inline-flex items-center text-sm text-glass-text-secondary hover:text-glass-text-link mb-4 transition-colors group"
          >
            <svg className="w-4 h-4 mr-1 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>返回 Skill 仓库</span>
            <span className="glass-pill glass-pill-cyan ml-2">
            v2.0.7+
            </span>
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-glass-text-primary mb-1">{skill.name}</h1>
              <p className="gradient-text text-sm font-medium mb-3 tracking-wide">✨ Skill Hub 优质技能</p>
              <div className="mt-2 flex items-center space-x-4 text-sm text-glass-text-secondary">
                {skill.author && (
                  <div className="flex items-center">
                    {skill.author.image && (
                      <img
                        src={skill.author.image}
                        alt={skill.author.name || ''}
                        className="w-6 h-6 rounded-full mr-2 ring-2 ring-glass-card-300/60"
                      />
                    )}
                    <span>{skill.author.name || '未知作者'}</span>
                  </div>
                )}
                {skill.namespace && (
                  <Link
                    href={`/namespaces/${skill.namespace.slug}`}
                    className="glass-pill glass-pill-violet hover:opacity-90 transition-opacity"
                  >
                    {skill.namespace.name}
                  </Link>
                )}
                {/* 子分类徽章 */}
                {skill.subcategory && (
                  <span className="glass-pill glass-pill-cyan">
                    {getSubcategoryLabel(skill.subcategory)}
                  </span>
                )}
                {/* 置信度徽章 */}
                {skill.confidence && (
                  <span className={`glass-pill ${
                    skill.confidence >= 80 ? 'glass-pill-success' :
                    skill.confidence >= 60 ? 'glass-pill-warning' :
                    'glass-pill-neutral'
                  }`}>
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    {Math.round(skill.confidence)}%
                  </span>
                )}
                <span className="flex items-center text-glass-text-secondary">
                  <svg className="w-4 h-4 mr-1 text-glass-text-link" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="font-semibold text-glass-text-primary">{skill.downloadCount.toLocaleString()}</span>
                  <span className="ml-1">次下载</span>
                </span>
                <span className="flex items-center text-glass-text-secondary">
                  <svg className="w-4 h-4 mr-1 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  <span className="font-semibold text-glass-text-primary">{skill.rating.toFixed(1)}</span>
                  <span className="ml-1">({skill.reviewCount} 评价)</span>
                </span>
              </div>
            </div>

            <a
              href={skill.repositoryUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="glow-btn glow-btn-primary glow-btn-lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              查看并下载
              <svg className="w-4 h-4 ml-1.5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 主内容区 */}
          <main className="lg:col-span-2 space-y-6">
            {/* v3 M1：三形态 Deliverable 区块（按 deliveryCategory 分流） */}
            {skill.deliveryCategory === 'CONTENT_GENERATION' && skill.llmConfig && (
              <ContentDeliverableWrapper
                slug={skill.slug}
                skillName={skill.name}
                // v2.0.7+：Prisma 端 llmConfig 的 input_schema.params 是 unknown（Prisma JSON 字段不窄化）。
                // ContentDeliverableWrapper 需要 InputParam[]，用 `as any` 跳过 strict assignability 检查。
                                llmConfig={skill.llmConfig as any as LlmConfigPayload}
              />
            )}
            {skill.deliveryCategory === 'ENVIRONMENT_DEPENDENT' && (
              <EnvironmentDeliverableWrapper
                slug={skill.slug}
                skillName={skill.name}
                targetSoftware={(skill.executionConfig as unknown as ExecutionConfigPayload | null)?.target_software}
                installType={(skill.executionConfig as unknown as ExecutionConfigPayload | null)?.install_type}
                installCommand={(skill.executionConfig as unknown as ExecutionConfigPayload | null)?.install_command}
              />
            )}
            {skill.deliveryCategory === 'OAUTH_AUTHORIZED' && (
              <OAuthDeliverableWrapper
                slug={skill.slug}
                skillName={skill.name}
                oauthProviders={(skill.llmConfig as unknown as LlmConfigPayload | null)?.oauth_providers}
              />
            )}

            {/* 描述 */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-lg shadow-gray-200/40 p-6 hover:shadow-xl hover:border-cyan-200/80 transition-all duration-200">
              <div className="h-1 w-16 bg-gradient-to-r from-cyan-400 to-magenta-500 rounded-full mb-3" />
              <h2 className="text-xl font-semibold text-gray-900 mb-4">简介</h2>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{skill.description}</p>
            </div>

            {/* README */}
            {skill.readme && (
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-lg shadow-gray-200/40 p-6 hover:shadow-xl hover:border-cyan-200/80 transition-all duration-200">
                <div className="h-1 w-16 bg-gradient-to-r from-cyan-400 to-magenta-500 rounded-full mb-3" />
                <h2 className="text-xl font-semibold text-gray-900 mb-4">README</h2>
                <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: skill.readme }} />
              </div>
            )}

            {/* 版本历史 */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-lg shadow-gray-200/40 p-6 hover:shadow-xl hover:border-cyan-200/80 transition-all duration-200">
              <div className="h-1 w-16 bg-gradient-to-r from-cyan-400 to-magenta-500 rounded-full mb-3" />
              <h2 className="text-xl font-semibold text-gray-900 mb-4">版本历史</h2>
              <div className="space-y-4">
                {skill.versions.map((version: { id: string; version: string; createdAt: Date; changelog?: string | null }) => (
                  <div key={version.id} className="border-l-2 border-cyan-200 hover:border-cyan-400 pl-4 pb-4 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-cyan-50/80 backdrop-blur-md border border-cyan-200/60 text-cyan-700">
                        v{version.version}
                      </span>
                      <span className="text-sm text-gray-500">
                        {new Date(version.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                    {version.changelog && (
                      <p className="text-sm text-gray-600">{version.changelog}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </main>

          {/* 侧边栏 */}
          <aside className="space-y-6">
            {/* 分类和标签 */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-lg shadow-gray-200/40 p-6 hover:shadow-xl hover:border-cyan-200/80 transition-all duration-200">
              <div className="h-1 w-12 bg-gradient-to-r from-cyan-400 to-magenta-500 rounded-full mb-3" />
              <h3 className="font-semibold text-gray-900 mb-4">分类</h3>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gradient-to-r from-cyan-50/80 to-magenta-50/80 backdrop-blur-md border border-cyan-200/60 text-cyan-800">
                {skill.category}
              </span>

              {skill.tags && skill.tags.length > 0 && (
                <>
                  <h3 className="font-semibold text-gray-900 mt-6 mb-4">标签</h3>
                  <div className="flex flex-wrap gap-2">
                    {skill.tags.map((tag: string, idx: number) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-white/60 backdrop-blur-md border border-gray-200/80 text-gray-700 hover:border-cyan-300 hover:bg-cyan-50/60 transition-colors"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 统计信息 */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-lg shadow-gray-200/40 p-6 hover:shadow-xl hover:border-cyan-200/80 transition-all duration-200">
              <div className="h-1 w-12 bg-gradient-to-r from-cyan-400 to-magenta-500 rounded-full mb-3" />
              <h3 className="font-semibold text-gray-900 mb-4">统计信息</h3>
              <dl className="space-y-3">
                <div className="flex justify-between items-center py-1 border-b border-gray-100/60">
                  <dt className="text-sm text-gray-600">下载次数</dt>
                  <dd className="text-sm font-bold bg-gradient-to-r from-cyan-600 to-cyan-500 bg-clip-text text-transparent">{skill.downloadCount.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-100/60">
                  <dt className="text-sm text-gray-600">评分</dt>
                  <dd className="text-sm font-bold bg-gradient-to-r from-amber-500 to-yellow-500 bg-clip-text text-transparent">{skill.rating.toFixed(1)} / 5.0</dd>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-100/60">
                  <dt className="text-sm text-gray-600">评价数</dt>
                  <dd className="text-sm font-semibold text-gray-900">{skill.reviewCount}</dd>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-100/60">
                  <dt className="text-sm text-gray-600">版本数</dt>
                  <dd className="text-sm font-semibold text-gray-900">{skill.versions.length}</dd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <dt className="text-sm text-gray-600">创建时间</dt>
                  <dd className="text-sm font-semibold text-gray-900">
                    {new Date(skill.createdAt).toLocaleDateString('zh-CN')}
                  </dd>
                </div>
              </dl>
            </div>

            {/* 相关链接 */}
            {skill.packageUrl && (
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-lg shadow-gray-200/40 p-6 hover:shadow-xl hover:border-cyan-200/80 transition-all duration-200">
                <div className="h-1 w-12 bg-gradient-to-r from-cyan-400 to-magenta-500 rounded-full mb-3" />
                <h3 className="font-semibold text-gray-900 mb-4">相关链接</h3>
                <a
                  href={skill.packageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-white/60 backdrop-blur-md border border-gray-200/80 text-gray-800 hover:bg-white/80 hover:border-cyan-300 hover:shadow-md hover:shadow-cyan-200/40 hover:text-cyan-700 transition-all group"
                >
                  <svg className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  查看代码仓库
                  <svg className="w-3.5 h-3.5 ml-1.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}

            {/* 报告错误 */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-lg shadow-gray-200/40 p-6 hover:shadow-xl hover:border-cyan-200/80 transition-all duration-200">
              <div className="h-1 w-12 bg-gradient-to-r from-cyan-400 to-magenta-500 rounded-full mb-3" />
              <h3 className="font-semibold text-gray-900 mb-4">发现问题？</h3>
              <p className="text-sm text-gray-600 mb-4">
                如果您发现分类或其他信息有误，请告诉我们。
              </p>
              <FeedbackButton
                skillSlug={skill.slug}
                currentCategory={skill.category}
                currentSubcategory={skill.subcategory || undefined}
              />
            </div>

            {/* 相关Skills推荐 */}
            {relatedSkills.length > 0 && (
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-lg shadow-gray-200/40 p-6 hover:shadow-xl hover:border-cyan-200/80 transition-all duration-200">
                <div className="h-1 w-12 bg-gradient-to-r from-cyan-400 to-magenta-500 rounded-full mb-3" />
                <h3 className="font-semibold text-gray-900 mb-4">相关 Skills</h3>
                <div className="space-y-4">
                  {relatedSkills.map((relatedSkill) => (
                    <Link
                      key={relatedSkill.id}
                      href={`/skills/${relatedSkill.slug}`}
                      className="block p-4 rounded-xl bg-white/40 backdrop-blur-md border border-gray-200/60 hover:border-cyan-300 hover:bg-white/70 hover:shadow-lg hover:shadow-cyan-200/30 hover:-translate-y-0.5 transition-all duration-200 group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 group-hover:bg-gradient-to-r group-hover:from-cyan-600 group-hover:to-magenta-600 group-hover:bg-clip-text group-hover:text-transparent transition-all">
                            {relatedSkill.name}
                          </h4>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {relatedSkill.description}
                          </p>
                          {relatedSkill.similarity && (
                            <div className="mt-2 flex items-center text-xs text-gray-500">
                              <svg className="w-3 h-3 mr-1 text-cyan-500" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                              </svg>
                              相似度: <span className="font-semibold ml-0.5 text-cyan-700">{(relatedSkill.similarity * 100).toFixed(0)}%</span>
                            </div>
                          )}
                        </div>
                        <svg className="w-4 h-4 ml-2 mt-1 text-gray-400 group-hover:text-cyan-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

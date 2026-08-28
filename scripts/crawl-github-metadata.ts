/**
 * 轻量级 GitHub 元数据爬取脚本
 * 只获取仓库元数据，不克隆代码（适合大规模技能收集）
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import axios, { AxiosError } from 'axios';
import { prisma } from '../apps/web/lib/prisma';

// 加载环境变量
config({ path: resolve(__dirname, '../apps/web/.env.local') });

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  created_at: string;
  updated_at: string;
  topics: string[];
  owner: {
    login: string;
    avatar_url: string;
  };
}

async function crawlGitHubMetadata() {
  console.log('🚀 Starting lightweight GitHub metadata crawl...\n');
  
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken || githubToken.includes('placeholder')) {
    console.error('❌ ERROR: GITHUB_TOKEN not configured!');
    process.exit(1);
  }
  
  console.log('✅ GitHub Token configured\n');
  
  const headers = {
    'Authorization': `token ${githubToken}`,
    'Accept': 'application/vnd.github.v3+json'
  };

  let totalSuccess = 0;
  let totalFailed = 0;

  try {
    // 定义搜索查询 - 针对 AI Agent Skills
    const searchQueries = [
      'claude skills',
      'agent skills',
      'AI agent skill',
      'skill marketplace',
      'cursor skills',
      'codex skills',
      'AI workflow',
      'autonomous agent',
    ];

    for (const query of searchQueries) {
      console.log(`🔍 Searching: "${query}"`);
      
      try {
        const response = await axios.get('https://api.github.com/search/repositories', {
          headers,
          params: {
            q: `${query} stars:>10`,
            sort: 'stars',
            order: 'desc',
            per_page: 15,
            page: 1
          },
          timeout: 10000
        });

        const repos: GitHubRepo[] = response.data.items;
        console.log(`   Found ${repos.length} repositories\n`);

        // 处理每个仓库
        for (const repo of repos) {
          try {
            // 检查是否已存在
            const existing = await prisma.skill.findFirst({
              where: {
                OR: [
                  { repositoryUrl: repo.html_url },
                  { sourceId: repo.id.toString() }
                ]
              }
            });

            if (existing) {
              console.log(`   ⏭️  Skipped (exists): ${repo.full_name}`);
              continue;
            }

            // 计算质量分数 (0-100)
            const qualityScore = Math.min(100, 
              (repo.stargazers_count / 100) * 40 +  // stars 占 40% (100星=40分)
              (repo.forks_count / 50) * 30 +        // forks 占 30% (50 fork=30分)
              30                                    // 基础分 30%
            );

            // 获取或创建系统用户
            let systemUser = await prisma.user.findFirst({
              where: { email: 'system@skillhub.local' }
            });
            
            if (!systemUser) {
              systemUser = await prisma.user.create({
                data: {
                  email: 'system@skillhub.local',
                  name: 'System Bot',
                  emailVerified: new Date(),
                }
              });
              console.log('✅ Created system user');
            }

            // 获取 README 内容（通过 GitHub API）
            let readmeContent = '';
            try {
              const readmeResponse = await axios.get(
                `https://api.github.com/repos/${repo.full_name}/readme`,
                { 
                  headers,
                  timeout: 5000 
                }
              );
              
              if (readmeResponse.data.content) {
                // GitHub API 返回 base64 编码的内容
                readmeContent = Buffer.from(readmeResponse.data.content, 'base64').toString('utf-8');
                // 限制长度，避免数据库过大
                readmeContent = readmeContent.substring(0, 50000);
              }
            } catch {
              console.log(`   ⚠️  Could not fetch README for ${repo.full_name}`);
            }

            // 创建技能记录
            await prisma.skill.create({
              data: {
                name: repo.name,
                slug: repo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 255),
                description: repo.description || `AI Agent Skill from ${repo.full_name}`,
                version: '1.0.0',
                source: 'github',
                sourceId: repo.id.toString(),
                sourceUrl: repo.html_url,
                authorName: repo.owner.login,
                authorUrl: `https://github.com/${repo.owner.login}`,
                category: 'development',
                tags: repo.topics?.slice(0, 10) || [],
                languages: repo.language ? [repo.language] : [],
                qualityScore: Math.round(qualityScore),
                starCount: repo.stargazers_count,
                downloadCount: repo.forks_count,
                repositoryUrl: repo.html_url,
                documentationUrl: repo.homepage || repo.html_url,
                packageUrl: repo.html_url,
                readme: readmeContent,
                updatedAt: new Date(repo.updated_at),
                status: 'APPROVED',  // 直接设为已审核
                isPublic: true,              // 直接设为公开
                authorId: systemUser.id,
              }
            });

            console.log(`   ✅ Added: ${repo.full_name} (${repo.stargazers_count}⭐, Quality: ${Math.round(qualityScore)})`);
            totalSuccess++;

            // 避免速率限制 (GitHub API: 5000 requests/hour)
            await new Promise(resolve => setTimeout(resolve, 300));

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`   ❌ Failed: ${repo.full_name} - ${errorMessage}`);
            totalFailed++;
          }
        }

        // 查询间隔，避免触发速率限制
        console.log('   ⏳ Waiting 3 seconds before next query...\n');
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ❌ Search failed: ${errorMessage}\n`);
        totalFailed++;
        
        // 如果是速率限制，等待更长时间
        if (error instanceof Error && 'response' in error) {
          const axiosError = error as AxiosError;
          if (axiosError.response?.status === 403) {
            console.log('   ⚠️  Rate limit hit, waiting 60 seconds...');
            await new Promise(resolve => setTimeout(resolve, 60000));
          }
        }
      }
    }

    // 统计结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 CRAWLING SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Successfully Added: ${totalSuccess}`);
    console.log(`Total Failed: ${totalFailed}`);
    console.log('='.repeat(60));

    // 验证数据库
    console.log('\n🔍 Verifying database...');
    
    const totalCount = await prisma.skill.count();
    const githubCount = await prisma.skill.count({
      where: { source: 'github' }
    });
    
    console.log('\n📈 Database Statistics:');
    console.log(`   Total Skills: ${totalCount}`);
    console.log(`   From GitHub: ${githubCount}`);
    
    // 显示最新的技能
    const recentSkills = await prisma.skill.findMany({
      where: { source: 'github' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        slug: true,
        qualityScore: true,
        starCount: true,
        repositoryUrl: true,
      }
    });
    
    console.log('\n🆕 Recent GitHub Skills:');
    recentSkills.forEach((skill, index) => {
      console.log(`   ${index + 1}. ${skill.name}`);
      console.log(`      Stars: ${skill.starCount}, Quality: ${skill.qualityScore}/100`);
      console.log(`      URL: ${skill.repositoryUrl}`);
    });
    
    console.log('\n✅ GitHub metadata crawling completed!\n');
    console.log('💡 Next: Visit http://localhost:3001 to see the skills on homepage');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : 'No stack trace';
    console.error('\n❌ Fatal error:', errorMessage);
    console.error(errorStack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 执行
crawlGitHubMetadata().catch(console.error);

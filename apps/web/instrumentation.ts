// Next.js instrumentation file - runs when the server starts.
//
// ⚠️ 注意：Next.js 会同时将此文件编译进 Node.js 运行时与 Edge 运行时
// （产物分别为 instrumentation.js 与 edge-instrumentation.js）。
// 因此任何 Node 内建模块（path / fs / os / crypto 等）都不得被静态引入，
// Node-only 逻辑必须放在 NEXT_RUNTIME === 'nodejs' 守卫内动态加载，
// 否则 Edge 构建报 "Can't resolve 'path'" 或 Vercel 报 unsupported modules。
//
// dotenv 不再需要：Next.js 会在服务启动时自动加载 .env.local 等环境文件，
// Vercel 生产环境变量由平台注入。

export async function register() {
  // 只在 Node.js 运行时加载 Node-only 依赖并启动调度器；Edge 运行时直接跳过。
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.DISABLE_SCHEDULER !== 'true') {
    const { startScheduler } = await import('./lib/services/TaskScheduler');

    console.log('\n🚀 ========================================');
    console.log('🚀 Starting SkillHub Task Scheduler...');
    console.log('🚀 ========================================\n');

    // Check environment variables
    console.log('Environment Check:');
    console.log(`  GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    console.log(`  SKILLSMP_API_KEY: ${process.env.SKILLSMP_API_KEY ? '✅ Configured' : '❌ Missing'}`);
    console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Configured' : '❌ Missing'}`);
    console.log('');

    // Fire and forget - don't await to avoid blocking server startup
    // 使用 process.nextTick 确保完全不阻塞 Next.js 服务器启动
    process.nextTick(async () => {
      try {
        // 额外延迟,确保 Prisma 和其他服务完全初始化
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('🔄 Initializing Task Scheduler...');
        await startScheduler();
        console.log('\n✅ Task Scheduler initialized successfully\n');
      } catch (error) {
        console.error('\n⚠️ Task Scheduler initialization failed (non-critical):', error instanceof Error ? error.message : error);
        console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.log('⚠️ Website will still function normally without scheduler\n');
      }
    });
  } else if (process.env.DISABLE_SCHEDULER === 'true') {
    console.log('\nℹ️  Task Scheduler is disabled via DISABLE_SCHEDULER environment variable\n');
  }
}

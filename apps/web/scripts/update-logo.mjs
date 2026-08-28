// scripts/update-logo.mjs
// One-off: regenerate all logo/favicon assets from a single source PNG.
//
// Usage:  node scripts/update-logo.mjs [<source.png>] [--root]
//         --root   also update the root-level logo.png (and remove logo2.png/logo.jpeg
//                  duplicates that are flagged for deletion in docs/deployment/DEPLOYMENT_CLEANUP_GUIDE.md)
//
// Default source: skillhub-logo.png at repo root.
//
// Targets:
//   apps/web/public/{logo,skillhub,icon,apple-touch-icon}.png
//   apps/web/public/favicon.ico        (multi-size 16/32/48 PNG-in-ICO)
//   apps/web/app/icon.png              (Next.js App Router convention)
//
// When --root is passed, additionally:
//   ./logo.png                         (canonical source — keeps deployment-cleanup happy)
//
// Run from apps/web/ so sharp's prebuilt binary resolves correctly.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';
import { icoPack } from './ico-pack.mjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '..', '..');

// Resolve sharp from the workspace's pnpm store (apps/web doesn't list it directly).
const sharpPath = path.join(
  repoRoot,
  'node_modules',
  '.pnpm',
  'sharp@0.34.5',
  'node_modules',
  'sharp',
);
const sharp = require(sharpPath);

const args = process.argv.slice(2);
const updateRoot = args.includes('--root');
const sourceArg = args.find((a) => !a.startsWith('--'));
const sourcePath = sourceArg
  ? path.resolve(process.cwd(), sourceArg)
  : path.join(repoRoot, 'skillhub-logo.png');

console.log('[update-logo] source:', sourcePath);

const sourceMeta = await sharp(sourcePath).metadata();
console.log(
  `[update-logo] source meta: ${sourceMeta.format} ${sourceMeta.width}x${sourceMeta.height}`,
);

const pngTargets = [
  // skillhub.png — used by OG/Twitter card and many auth pages (1:1 source square for OG).
  { out: path.join(webRoot, 'public', 'skillhub.png'), size: 1200 },
  // logo.png — used by Agent Card iconUrl + a2a docs.
  { out: path.join(webRoot, 'public', 'logo.png'), size: 512 },
  // icon.png in public/ — generic fallback referenced by Next metadata.
  { out: path.join(webRoot, 'public', 'icon.png'), size: 512 },
  // apple-touch-icon.png — 180x180 per Apple HIG.
  { out: path.join(webRoot, 'public', 'apple-touch-icon.png'), size: 180 },
  // app/icon.png — Next.js App Router icon route.
  { out: path.join(webRoot, 'app', 'icon.png'), size: 512 },
];

if (updateRoot) {
  // Root-level canonical source. Matches docs/deployment/DEPLOYMENT_CLEANUP_GUIDE.md.
  pngTargets.push({ out: path.join(repoRoot, 'logo.png'), size: 512 });
}

for (const t of pngTargets) {
  await sharp(sourcePath)
    .resize(t.size, t.size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(t.out);
  console.log(`[update-logo] wrote ${path.relative(repoRoot, t.out)}  ${t.size}x${t.size}`);
}

// favicon.ico — multi-size ICO (16/32/48).
const icoPath = path.join(webRoot, 'public', 'favicon.ico');
const sizes = [16, 32, 48];
const pngBuffers = await Promise.all(
  sizes.map((s) =>
    sharp(sourcePath)
      .resize(s, s, { fit: 'cover' })
      .png()
      .toBuffer(),
  ),
);
const { writeFile } = await import('node:fs/promises');
await writeFile(icoPath, icoPack(pngBuffers, sizes));
console.log(`[update-logo] wrote ${path.relative(repoRoot, icoPath)}  sizes=${sizes.join(',')}`);

if (updateRoot) {
  // Root-level duplicates flagged for deletion in docs/deployment/DEPLOYMENT_CLEANUP_GUIDE.md
  // and scripts/cleanup-before-deploy.{sh,bat}. They're not referenced by code.
  for (const dup of ['logo2.png', 'logo.jpeg']) {
    const p = path.join(repoRoot, dup);
    try {
      await rm(p);
      console.log(`[update-logo] removed duplicate ${dup}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[update-logo] failed to remove ${dup}: ${err.message}`);
      }
    }
  }
}

console.log('[update-logo] done');
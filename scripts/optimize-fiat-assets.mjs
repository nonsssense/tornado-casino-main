/**
 * Optimize fiat deposit assets (bank logos + bonus banner) for the Mini App.
 *
 * Source PNGs live in "fiat assets/" (design export folder). Optimized WebP
 * copies are written to assets/fiat/ so they are served by the existing
 * /assets static mount — no backend change required.
 *
 * Run: node scripts/optimize-fiat-assets.mjs
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const SRC_DIR = path.resolve('fiat assets');
const OUT_DIR = path.resolve('assets', 'fiat');

/** source file -> output basename (extension added by encoder) */
const MAP = [
  { src: 'kaspi bank logo.png', out: 'kaspi' },
  { src: 'berek bank logo.png', out: 'bereke' },
  { src: 'activabonus banner for fiat deposit.png', out: 'bonus-banner' },
];

function fmt(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function pct(from, to) {
  return `${(((from - to) / from) * 100).toFixed(1)}%`;
}

async function optimize({ src, out }) {
  const inputPath = path.join(SRC_DIR, src);
  if (!fs.existsSync(inputPath)) {
    console.warn(`SKIP missing: ${src}`);
    return null;
  }

  const input = fs.readFileSync(inputPath);
  const meta = await sharp(input, { failOn: 'none' }).metadata();

  // Bank logos are square icons rendered small in the UI — cap the raster so we
  // never ship a 1024px asset for a ~48px slot. Banner keeps its wide aspect.
  const isBanner = out === 'bonus-banner';
  let pipeline = sharp(input, { failOn: 'none' });
  if (!isBanner && (meta.width || 0) > 256) {
    pipeline = pipeline.resize({ width: 256, height: 256, fit: 'inside' });
  } else if (isBanner && (meta.width || 0) > 1280) {
    pipeline = pipeline.resize({ width: 1280, fit: 'inside' });
  }

  const webp = await pipeline
    .webp({ quality: 88, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();

  const outPath = path.join(OUT_DIR, `${out}.webp`);
  fs.writeFileSync(outPath, webp);

  console.log(
    `${src} -> assets/fiat/${out}.webp  ${fmt(input.length)} -> ${fmt(webp.length)} (${pct(input.length, webp.length)})`,
  );
  return { src, out: `${out}.webp`, original: input.length, webp: webp.length };
}

async function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.log('"fiat assets" folder not found, nothing to optimize.');
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const report = [];
  for (const entry of MAP) {
    const row = await optimize(entry);
    if (row) report.push(row);
  }

  const reportPath = path.join('scripts', 'fiat-assets-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

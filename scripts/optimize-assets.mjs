/**
 * Per-asset image optimization for Telegram Mini App.
 * Compares encodings, writes optimized files next to originals, prints a report.
 * Original PNGs are never deleted.
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ASSETS = path.resolve('assets');

function fmt(n) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function pct(from, to) {
  return `${(((from - to) / from) * 100).toFixed(1)}%`;
}

/** Extract embedded raster from Figma "fake SVG" wrappers when no PNG source exists. */
async function extractEmbeddedPng(svgName, pngName) {
  const pngPath = path.join(ASSETS, pngName);
  if (fs.existsSync(pngPath)) {
    console.log(`keep existing PNG: ${pngName}`);
    return pngPath;
  }
  const svg = fs.readFileSync(path.join(ASSETS, svgName), 'utf8');
  const m =
    svg.match(/xlink:href="data:image\/(png|jpeg);base64,([^"]+)"/) ||
    svg.match(/href="data:image\/(png|jpeg);base64,([^"]+)"/);
  if (!m) throw new Error(`No embedded image in ${svgName}`);
  const buf = Buffer.from(m[2], 'base64');
  fs.writeFileSync(pngPath, buf);
  console.log(`extracted ${pngName} (${fmt(buf.length)}) from ${svgName}`);
  return pngPath;
}

/**
 * Decide encoding per asset.
 * Priority: visual identity > size. Tiny sharp icons → lossless WebP.
 * Larger UI/brand art with alpha → WebP q90 (alphaQuality 100).
 * Brand wordmark → WebP q92 (text edges).
 */
function decideStrategy(file, meta, origBytes) {
  const pixels = (meta.width || 0) * (meta.height || 0);
  const isTinyIcon = pixels <= 32 * 32 && origBytes < 3000;
  const isWordmark =
    /tornado no background/i.test(file) ||
    (meta.width > 400 && meta.height < 300 && meta.hasAlpha);

  if (isTinyIcon) {
    return {
      format: 'webp',
      options: { lossless: true, effort: 6 },
      reason:
        'Tiny UI icon with alpha — lossless WebP preserves exact pixels/colors and still beats PNG.',
    };
  }

  if (isWordmark) {
    return {
      format: 'webp',
      options: { quality: 92, alphaQuality: 100, effort: 6, smartSubsample: true },
      reason:
        'Brand wordmark with transparency — WebP q92 keeps text edges sharp while cutting size ~70% vs PNG.',
    };
  }

  // Larger UI icons / illustrations displayed small in the shell
  return {
    format: 'webp',
    options: { quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true },
    reason:
      'UI artwork with alpha — WebP q90 + full alpha quality is visually identical at UI sizes and much smaller than PNG/lossless WebP.',
  };
}

async function encode(buf, strategy) {
  let pipeline = sharp(buf, { failOn: 'none' });
  if (strategy.format === 'webp') {
    return pipeline.webp(strategy.options).toBuffer();
  }
  if (strategy.format === 'png') {
    return pipeline.png(strategy.options).toBuffer();
  }
  throw new Error(`Unknown format ${strategy.format}`);
}

async function compareAndMaybePreferPng(buf, strategy, origBytes) {
  const webpBuf = await encode(buf, strategy);

  // Also measure optimized PNG and lossless WebP for the report / safety check
  const pngOpt = await sharp(buf, { failOn: 'none' })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
  const webpLossless = await sharp(buf, { failOn: 'none' })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();

  // If chosen WebP is somehow larger than optimized PNG, keep PNG
  if (webpBuf.length >= pngOpt.length && pngOpt.length < origBytes) {
    return {
      buffer: pngOpt,
      format: 'png',
      ext: '.png',
      reason:
        'Optimized PNG was smaller than WebP for this asset while remaining lossless — kept PNG.',
      alternatives: { webpChosen: webpBuf.length, pngOpt: pngOpt.length, webpLossless: webpLossless.length },
    };
  }

  // If lossy WebP barely beats lossless and file is a tiny icon, prefer lossless
  if (
    !strategy.options.lossless &&
    webpLossless.length < origBytes &&
    webpBuf.length > webpLossless.length * 0.92
  ) {
    return {
      buffer: webpLossless,
      format: 'webp',
      ext: '.webp',
      reason:
        'Lossless WebP nearly as small as lossy — preferred for exact pixel fidelity.',
      alternatives: { webpChosen: webpBuf.length, pngOpt: pngOpt.length, webpLossless: webpLossless.length },
    };
  }

  return {
    buffer: webpBuf,
    format: 'webp',
    ext: '.webp',
    reason: strategy.reason,
    alternatives: { webpChosen: webpBuf.length, pngOpt: pngOpt.length, webpLossless: webpLossless.length },
  };
}

const PNG_SOURCES = [
  'ava icon tornado main.png',
  'btc icon.png',
  'eth icon.png',
  'menu_bar_casino.png',
  'menu_bar_profile.png',
  'menu_bar_referals.png',
  'menu_bar_wallet.png',
  'solana icon.png',
  'tether.png',
  'tornado no background main.png',
  'tornado support main.png',
  'tornado full name logo 1.png',
  'tron icon.png',
  'usdc icon.png',
  'personal_info_profile_page.png',
  'profile_page_bonuses_page.png',
  'welcome_message_banner 1.png',
  'welcome_message_bonus_banner 1.png',
];

async function main() {
  await extractEmbeddedPng('personal_info_profile_page.svg', 'personal_info_profile_page.png');
  await extractEmbeddedPng('profile_page_bonuses_page.svg', 'profile_page_bonuses_page.png');

  const report = [];

  for (const file of PNG_SOURCES) {
    const inputPath = path.join(ASSETS, file);
    if (!fs.existsSync(inputPath)) {
      console.warn(`SKIP missing: ${file}`);
      continue;
    }

    const buf = fs.readFileSync(inputPath);
    const meta = await sharp(buf, { failOn: 'none' }).metadata();
    const strategy = decideStrategy(file, meta, buf.length);
    const result = await compareAndMaybePreferPng(buf, strategy, buf.length);

    const base = file.replace(/\.png$/i, '');
    const outName = `${base}${result.ext}`;
    const outPath = path.join(ASSETS, outName);

    // Never overwrite the original PNG when output is also PNG with same name
    if (path.resolve(outPath) === path.resolve(inputPath)) {
      const optName = `${base}.optimized.png`;
      fs.writeFileSync(path.join(ASSETS, optName), result.buffer);
      report.push({
        original: file,
        originalSize: buf.length,
        optimized: optName,
        optimizedSize: result.buffer.length,
        format: 'png',
        reduction: pct(buf.length, result.buffer.length),
        dims: `${meta.width}x${meta.height}`,
        hasAlpha: !!meta.hasAlpha,
        reason: result.reason + ' (written as .optimized.png to preserve original)',
      });
      console.log(`wrote ${optName}`);
      continue;
    }

    fs.writeFileSync(outPath, result.buffer);
    report.push({
      original: file,
      originalSize: buf.length,
      optimized: outName,
      optimizedSize: result.buffer.length,
      format: result.format,
      reduction: pct(buf.length, result.buffer.length),
      dims: `${meta.width}x${meta.height}`,
      hasAlpha: !!meta.hasAlpha,
      reason: result.reason,
      alternatives: result.alternatives,
    });
    console.log(
      `${file} → ${outName}  ${fmt(buf.length)} → ${fmt(result.buffer.length)} (${pct(buf.length, result.buffer.length)})`,
    );
  }

  const reportPath = path.join('scripts', 'asset-optimization-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${reportPath}`);

  const totalOrig = report.reduce((s, r) => s + r.originalSize, 0);
  const totalOpt = report.reduce((s, r) => s + r.optimizedSize, 0);
  console.log(`TOTAL: ${fmt(totalOrig)} → ${fmt(totalOpt)} (${pct(totalOrig, totalOpt)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

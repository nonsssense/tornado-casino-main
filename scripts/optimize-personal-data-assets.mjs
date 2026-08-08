import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ASSETS_DIR = path.resolve('personal_data_assets');

function fmt(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function optimizePng(filePath) {
  const input = fs.readFileSync(filePath);
  const pngOptimized = await sharp(input).png({ compressionLevel: 9, effort: 10 }).toBuffer();
  const webp = await sharp(input).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toBuffer();

  const outBase = filePath.replace(/\.png$/i, '');
  const outWebpPath = `${outBase}.webp`;

  fs.writeFileSync(filePath, pngOptimized);
  fs.writeFileSync(outWebpPath, webp);

  return {
    file: path.basename(filePath),
    original: input.length,
    optimizedPng: pngOptimized.length,
    webp: webp.length,
  };
}

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.log('personal_data_assets folder not found, skipping.');
    return;
  }

  const files = fs.readdirSync(ASSETS_DIR).filter((name) => /\.png$/i.test(name));
  if (!files.length) {
    console.log('No PNG files found in personal_data_assets.');
    return;
  }

  const report = [];
  for (const name of files) {
    const row = await optimizePng(path.join(ASSETS_DIR, name));
    report.push(row);
    console.log(
      `${row.file}: ${fmt(row.original)} -> PNG ${fmt(row.optimizedPng)} | WEBP ${fmt(row.webp)}`,
    );
  }

  const reportPath = path.resolve('scripts', 'personal-data-assets-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report saved: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


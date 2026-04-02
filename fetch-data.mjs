/**
 * Fetches RESO Data Dictionary reference sheets from the web-api-commander repo.
 * Downloads XLSX files for each configured version into dd-data/.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DD_DATA_DIR = join(__dirname, 'dd-data');

const BASE_URL = 'https://github.com/RESOStandards/web-api-commander/raw/main/src/main/resources';

const FILES = [
  { version: '1.7', filename: 'RESODataDictionary-1.7.xlsx' },
  { version: '2.0', filename: 'RESODataDictionary-2.0.xlsx' },
  // 2.1 uses 2.0 sheet until a dedicated sheet is available
  { version: '2.1', filename: 'RESODataDictionary-2.0.xlsx', outputFilename: 'RESODataDictionary-2.1.xlsx' },
];

mkdirSync(DD_DATA_DIR, { recursive: true });

console.log('Fetching Data Dictionary reference sheets...\n');

for (const { version, filename, outputFilename } of FILES) {
  const url = `${BASE_URL}/${filename}`;
  const outName = outputFilename || filename;
  const outPath = join(DD_DATA_DIR, outName);

  console.log(`  DD ${version}: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`  ERROR: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(outPath, buffer);
  console.log(`  → ${outName} (${(buffer.length / 1024).toFixed(0)} KB)\n`);
}

console.log('Done.');

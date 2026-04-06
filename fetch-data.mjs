/**
 * Fetches RESO Data Dictionary reference sheets from the transport repo.
 * Downloads XLSX files for each configured version into dd-data/.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DD_DATA_DIR = join(__dirname, 'dd-data');

// DD sheets now live in the transport repo
const TRANSPORT_BRANCH = '158-rcp-36-data-dictionary-21';
const BASE_URL = `https://github.com/RESOStandards/transport/raw/${TRANSPORT_BRANCH}/artifacts/data-dictionary/sheets`;

const FILES = [
  { version: '1.7', filename: 'RESODataDictionary-1.7.xlsx' },
  { version: '2.0', filename: 'RESODataDictionary-2.0.xlsx' },
  { version: '2.1', filename: 'RESODataDictionary-2.1.xlsx' },
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

#!/usr/bin/env node

/**
 * Generate the DDWiki → dd.reso.org redirect map.
 *
 * Reads the DD 1.7 and 2.0 XLSX files and emits a JSON map from
 * old Confluence-style ddwiki paths to new dd.reso.org paths. The
 * 404.html page on dd.reso.org loads this file and does a fast
 * lookup to redirect old links.
 *
 * DD 2.1 was never hosted on the old ddwiki.reso.org site, so it
 * is intentionally not included.
 *
 * Four URL types per version, all constructed deterministically
 * from the data columns (ResourceName, StandardName, LookupName,
 * StandardLookupValue). The map is independent of WikiPageUrl /
 * WikiPageTitle / WikiPageId cell values, which means the DD lint
 * script (which rewrites WikiPageUrl to new-format URLs) can run
 * before or after this script without breaking anything.
 *
 *   Resource     display/DDW{ver}/{ResourceName}+Resource
 *                  → /DD{ver}/{ResourceName}/
 *   Field        display/DDW{ver}/{StandardName}+Field          (space → +)
 *                  → /DD{ver}/{ResourceName}/{StandardName}/
 *   Lookup       display/DDW{ver}/{LookupName}+Lookups          (space → +)
 *                  → /DD{ver}/lookups/{LookupName}/
 *   Lookup Value display/DDW{ver}/{StandardLookupValue}         (space → +, no suffix)
 *                  → /DD{ver}/lookups/{LookupName}/{value url-encoded}/
 *
 * Usage:
 *   node generate-redirects.mjs [--source-dir <path>]
 *
 * By default fetches the un-linted XLSX from web-api-commander on
 * GitHub (the canonical un-linted copies). Caches them under
 * .dd-redirect-cache/ so re-runs are fast and the build still works
 * if GitHub is briefly unavailable. Pass --source-dir to read from
 * a local directory instead (handy for offline iteration).
 *
 * Output:
 *   dd-output/redirects.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import xlsx from 'xlsx';

const argv = process.argv.slice(2);
const sourceDirArg = argv.indexOf('--source-dir');
const sourceDir = sourceDirArg >= 0 ? argv[sourceDirArg + 1] : null;

const CACHE_DIR = '.dd-redirect-cache';

const DD_VERSIONS = [
  {
    name: 'RESODataDictionary-1.7.xlsx',
    url: 'https://github.com/RESOStandards/web-api-commander/raw/refs/heads/main/src/main/resources/RESODataDictionary-1.7.xlsx',
    wikiKey: 'DDW17',
    outKey: 'DD1.7',
  },
  {
    name: 'RESODataDictionary-2.0.xlsx',
    url: 'https://github.com/RESOStandards/web-api-commander/raw/refs/heads/main/src/main/resources/RESODataDictionary-2.0.xlsx',
    wikiKey: 'DDW20',
    outKey: 'DD2.0',
  },
];

// Resolve the XLSX source for a given version: local --source-dir override
// wins; otherwise fetch from web-api-commander and cache. Returns a path
// suitable for xlsx.readFile().
const resolveSource = async ({ name, url }) => {
  if (sourceDir) {
    const localPath = `${sourceDir}/${name}`;
    if (!existsSync(localPath)) throw new Error(`--source-dir given but ${localPath} not found`);
    return localPath;
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = `${CACHE_DIR}/${name}`;
  try {
    console.log(`Fetching ${url}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(cachePath, buf);
    return cachePath;
  } catch (err) {
    if (existsSync(cachePath)) {
      console.warn(`Fetch failed (${err.message}); falling back to cached ${cachePath}`);
      return cachePath;
    }
    throw new Error(`Could not fetch ${url} and no cache present: ${err.message}`);
  }
};

// Confluence URL spaces are encoded as '+'. Other characters pass through.
const slugify = (s) => String(s).replace(/ /g, '+');

const redirects = {};
const stats = { versionLandings: 0, resources: 0, fields: 0, lookupEnums: 0, lookupValues: 0, pageIds: 0, hyperlinkCaught: 0 };

// Extract the redirect key from a ddwiki URL (handles both display/... and
// pages/viewpage.action?pageId=... forms). Returns null for non-ddwiki URLs.
const ddwikiKey = (s) => {
  if (typeof s !== 'string' || !s.toLowerCase().includes('ddwiki.reso.org')) return null;
  try {
    const u = new URL(s);
    if (u.pathname.startsWith('/pages/viewpage.action')) {
      const pid = new URLSearchParams(u.search).get('pageId');
      return pid ? `pageId:${pid}` : null;
    }
    // Collapse leading slashes — DD 1.7 hyperlinks used //display/... by mistake.
    return u.pathname.replace(/^\/+/, '');
  } catch {
    return null;
  }
};

// Determine the row that contains a given cell ref (e.g. "B17" → 17).
const rowFromRef = (ref) => {
  const m = ref.match(/^[A-Z]+(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
};

for (const version of DD_VERSIONS) {
  const { wikiKey, outKey } = version;
  const file = await resolveSource(version);
  console.log(`Processing ${file}…`);
  const wb = xlsx.readFile(file);

  // ── Version landing page (Confluence space root) ───────────────
  // Old: https://ddwiki.reso.org/display/DDW{ver}  →  /DD{ver}/
  // The JS handler strips trailing slash before lookup, so a single
  // key handles both forms in the client-side flow. The nginx-map
  // emitter writes both with and without trailing slash separately
  // because $request_uri is not normalized server-side.
  redirects[`display/${wikiKey}`] = `/${outKey}/`;
  stats.versionLandings++;

  // ── Fields: resource + field redirects ─────────────────────────
  //
  // Confluence behavior: the first row to take a given page name gets the
  // plain slug (e.g. ListingKey Field → /display/DDW20/ListingKey+Field).
  // Every subsequent row with the same name gets disambiguated in the title
  // as "ListingKey Field (Showing)" and the slug becomes
  // /display/DDW20/ListingKey+Field+(Showing). In the XLSX the canonical
  // owner's WikiPageUrl is the display/ slug; the duplicates' WikiPageUrl
  // is the pageId form. We use that signal to decide which row gets the
  // plain slug entry and which rows get the disambiguated slug entry.
  const fieldsSheet = wb.Sheets['Fields'] || wb.Sheets['fields'];
  if (fieldsSheet) {
    const fields = xlsx.utils.sheet_to_json(fieldsSheet);
    const seenResources = new Set();

    for (const f of fields) {
      if (!f.ResourceName || !f.StandardName) continue;

      if (!seenResources.has(f.ResourceName)) {
        redirects[`display/${wikiKey}/${f.ResourceName}+Resource`] = `/${outKey}/${f.ResourceName}/`;
        seenResources.add(f.ResourceName);
        stats.resources++;
      }

      const fieldDest = `/${outKey}/${f.ResourceName}/${f.StandardName}/`;
      const isCanonicalOwner = typeof f.WikiPageUrl === 'string' && f.WikiPageUrl.includes('/display/');

      if (isCanonicalOwner) {
        redirects[`display/${wikiKey}/${slugify(f.StandardName)}+Field`] = fieldDest;
      } else {
        // Disambiguated slug for duplicate-name rows: ListingKey+Field+(Showing)
        redirects[`display/${wikiKey}/${slugify(f.StandardName)}+Field+(${f.ResourceName})`] = fieldDest;
      }
      stats.fields++;

      // Confluence pageId form: /pages/viewpage.action?pageId={WikiPageId}
      // resolves to the same destination as the name-based URL on that row.
      // Required for the duplicate-name rows whose WikiPageUrl in the XLSX
      // was recorded only as a pageId URL, and as a general safety net for
      // any slug we can't reconstruct cleanly.
      if (f.WikiPageId) {
        redirects[`pageId:${f.WikiPageId}`] = fieldDest;
        stats.pageIds++;
      }
    }
  }

  // ── Lookups: lookup-enum + lookup-value redirects ──────────────
  const lookupsSheet = wb.Sheets['Lookups'] || wb.Sheets['lookups'];
  if (lookupsSheet) {
    const lookups = xlsx.utils.sheet_to_json(lookupsSheet);
    const seenLookupNames = new Set();

    for (const l of lookups) {
      if (!l.LookupName || !l.StandardLookupValue) continue;

      if (!seenLookupNames.has(l.LookupName)) {
        redirects[`display/${wikiKey}/${slugify(l.LookupName)}+Lookups`] = `/${outKey}/lookups/${l.LookupName}/`;
        seenLookupNames.add(l.LookupName);
        stats.lookupEnums++;
      }

      const lookupValueDest = `/${outKey}/lookups/${l.LookupName}/${encodeURIComponent(l.StandardLookupValue)}/`;
      const isCanonicalOwner = typeof l.WikiPageUrl === 'string' && l.WikiPageUrl.includes('/display/');

      if (isCanonicalOwner) {
        redirects[`display/${wikiKey}/${slugify(l.StandardLookupValue)}`] = lookupValueDest;
      } else {
        // Disambiguated slug for duplicate lookup-value names: e.g. Active+(MlsStatus)
        redirects[`display/${wikiKey}/${slugify(l.StandardLookupValue)}+(${l.LookupName})`] = lookupValueDest;
      }
      stats.lookupValues++;

      // pageId form for every row.
      if (l.WikiPageId) {
        redirects[`pageId:${l.WikiPageId}`] = lookupValueDest;
        stats.pageIds++;
      }
    }
  }

  // ── Hyperlink sweep: catch every URL the sheet actually references ─
  //
  // The data-column pass reconstructs URLs from current StandardName /
  // StandardLookupValue values. That misses any URL the wiki advertised
  // historically but no longer matches the current data: pre-rename
  // slugs, URL-encoded special chars (%28 vs literal '('), typos
  // ("lnterior"), multiple-space collapsing, etc. Walking the cell
  // hyperlinks captures whatever URLs the sheet actually links to and
  // routes them to the destination implied by their column position.
  //
  // The (sheet, column) determines the destination type:
  //   Fields col A (ResourceName link) → /DD{ver}/{ResourceName}/
  //   Fields col B (StandardName link) → /DD{ver}/{ResourceName}/{StandardName}/
  //   Fields col Y (WikiPageUrl)       → /DD{ver}/{ResourceName}/{StandardName}/
  //   Lookups col A (LookupName link)  → /DD{ver}/lookups/{LookupName}/
  //   Lookups col B (Value link)       → /DD{ver}/lookups/{LookupName}/{Value}/
  //   Lookups col R (WikiPageUrl)      → /DD{ver}/lookups/{LookupName}/{Value}/
  for (const [sheetName, isFields] of [['Fields', true], ['Lookups', false]]) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rowsArr = xlsx.utils.sheet_to_json(sheet);
    // sheet_to_json indexes 0-based for data rows (skipping header at row 1).
    // Cell ref "B5" is row 5 in 1-indexed sheet, which is data row 5-2 = 3 (0-indexed).
    const dataRowAt = (refRow) => rowsArr[refRow - 2];

    for (const ref of Object.keys(sheet)) {
      if (ref[0] === '!') continue;
      const cell = sheet[ref];
      if (!cell.l || !cell.l.Target) continue;
      const key = ddwikiKey(cell.l.Target);
      if (!key || key in redirects) continue;

      const refRow = rowFromRef(ref);
      if (!refRow || refRow < 2) continue;
      const row = dataRowAt(refRow);
      if (!row) continue;
      const col = ref.replace(/\d+$/, '');

      let dest;
      if (isFields) {
        if (!row.ResourceName) continue;
        if (col === 'A') {
          dest = `/${outKey}/${row.ResourceName}/`;
        } else if (row.StandardName) {
          dest = `/${outKey}/${row.ResourceName}/${row.StandardName}/`;
        }
      } else {
        if (!row.LookupName) continue;
        if (col === 'A') {
          dest = `/${outKey}/lookups/${row.LookupName}/`;
        } else if (row.StandardLookupValue) {
          dest = `/${outKey}/lookups/${row.LookupName}/${encodeURIComponent(row.StandardLookupValue)}/`;
        }
      }

      if (dest) {
        redirects[key] = dest;
        stats.hyperlinkCaught++;
      }
    }
  }
}

mkdirSync('dd-output', { recursive: true });
const outPath = 'dd-output/redirects.json';
writeFileSync(outPath, JSON.stringify(redirects, null, 0));

const sizeKb = (readFileSync(outPath).length / 1024).toFixed(1);
console.log(`\nGenerated ${outPath}:`);
console.log(`  ${stats.versionLandings} version landing pages`);
console.log(`  ${stats.resources} resource pages`);
console.log(`  ${stats.fields} field pages`);
console.log(`  ${stats.lookupEnums} lookup-enum pages`);
console.log(`  ${stats.lookupValues} lookup-value pages`);
console.log(`  ${stats.pageIds} Confluence pageId entries`);
console.log(`  ${stats.hyperlinkCaught} hyperlink-caught URLs (renames, %-encoded, typos)`);
console.log(`  ${Object.keys(redirects).length} total redirects`);
console.log(`  ${sizeKb} KB`);

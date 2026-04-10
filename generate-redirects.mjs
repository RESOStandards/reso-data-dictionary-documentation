#!/usr/bin/env node

/**
 * Generate the DDWiki → dd.reso.org redirect map.
 *
 * Reads the DD 1.7 and 2.0 XLSX files and produces a JSON file
 * mapping old Confluence-style DDWiki paths to new dd.reso.org
 * paths. The 404.html page on dd.reso.org loads this file and
 * does a fast lookup to redirect old links.
 *
 * Old URL patterns (Confluence):
 *   /display/DDW20/AboveGradeFinishedArea+Field
 *   /display/DDW20/Accessible+Approach+with+Ramp
 *   /display/DDW20/Property+Resource
 *   /display/DDW17/ListPrice+Field
 *
 * New URL patterns (dd.reso.org):
 *   /DD2.0/Property/AboveGradeFinishedArea/
 *   /DD2.0/lookups/AccessibilityFeatures/AccessibleApproachWithRamp/
 *   /DD2.0/Property/
 *   /DD1.7/Property/ListPrice/
 *
 * Usage:
 *   node generate-redirects.mjs
 *
 * Output:
 *   dd-output/redirects.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import xlsx from 'xlsx';

const DD_VERSIONS = [
  { file: 'dd-data/RESODataDictionary-1.7.xlsx', wikiKey: 'DDW17', outKey: 'DD1.7' },
  { file: 'dd-data/RESODataDictionary-2.0.xlsx', wikiKey: 'DDW20', outKey: 'DD2.0' },
];

/**
 * Extract the Confluence path segment from a full WikiPageUrl.
 * e.g. "https://ddwiki.reso.org/display/DDW20/AboveGradeFinishedArea+Field"
 *   → "display/DDW20/AboveGradeFinishedArea+Field"
 */
const extractPath = (url) => {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Remove leading slash
    return u.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
};

const redirects = {};
let fieldCount = 0;
let lookupCount = 0;
let resourceCount = 0;

for (const { file, wikiKey, outKey } of DD_VERSIONS) {
  console.log(`Processing ${file}...`);
  const wb = xlsx.readFile(file);

  // ── Fields ──────────────────────────────────────────────────────
  const fieldsSheet = wb.Sheets['Fields'] || wb.Sheets['fields'];
  if (fieldsSheet) {
    const fields = xlsx.utils.sheet_to_json(fieldsSheet);

    // Build resource → field mapping so we know which resource each field belongs to.
    // For fields in multiple resources, use the first one alphabetically (same as the DDWiki did).
    const fieldToResource = new Map();
    for (const f of fields) {
      if (!f.StandardName || !f.ResourceName) continue;
      if (!fieldToResource.has(f.StandardName)) {
        fieldToResource.set(f.StandardName, f.ResourceName);
      }
    }

    // Unique resources
    const resources = new Set(fields.map((f) => f.ResourceName).filter(Boolean));

    // Resource redirects: /display/DDW20/Property+Resource → /DD2.0/Property/
    for (const resource of resources) {
      const oldPath = `display/${wikiKey}/${resource}+Resource`;
      const newPath = `/${outKey}/${resource}/`;
      redirects[oldPath] = newPath;
      resourceCount++;
    }

    // Field redirects: /display/DDW20/AboveGradeFinishedArea+Field → /DD2.0/Property/AboveGradeFinishedArea/
    for (const f of fields) {
      if (!f.WikiPageUrl || !f.StandardName || !f.ResourceName) continue;
      const oldPath = extractPath(f.WikiPageUrl);
      if (!oldPath) continue;

      // Use the resource from this specific row (not the first-alphabetical fallback)
      // because the WikiPageUrl is unique per field×resource combination on the wiki.
      const newPath = `/${outKey}/${f.ResourceName}/${f.StandardName}/`;
      redirects[oldPath] = newPath;
      fieldCount++;

      // Also map Confluence pageId-style URLs
      // /pages/viewpage.action?pageId=2104909 → same destination
      if (f.WikiPageId) {
        redirects[`pageId:${f.WikiPageId}`] = newPath;
      }
    }
  }

  // ── Lookups ─────────────────────────────────────────────────────
  const lookupsSheet = wb.Sheets['Lookups'] || wb.Sheets['lookups'];
  if (lookupsSheet) {
    const lookups = xlsx.utils.sheet_to_json(lookupsSheet);

    for (const l of lookups) {
      if (!l.WikiPageUrl || !l.LookupName || !l.StandardLookupValue) continue;
      const oldPath = extractPath(l.WikiPageUrl);
      if (!oldPath) continue;

      const newPath = `/${outKey}/lookups/${l.LookupName}/${l.StandardLookupValue}/`;
      redirects[oldPath] = newPath;
      lookupCount++;

      if (l.WikiPageId) {
        redirects[`pageId:${l.WikiPageId}`] = newPath;
      }
    }
  }
}

// Write the redirect map
mkdirSync('dd-output', { recursive: true });
const outPath = 'dd-output/redirects.json';
writeFileSync(outPath, JSON.stringify(redirects, null, 0));

const size = (readFileSync(outPath).length / 1024).toFixed(1);
console.log(`\nGenerated ${outPath}:`);
console.log(`  ${resourceCount} resources`);
console.log(`  ${fieldCount} fields`);
console.log(`  ${lookupCount} lookups`);
console.log(`  ${Object.keys(redirects).length} total redirects`);
console.log(`  ${size} KB`);

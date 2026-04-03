---
title: Releases
layout: default
permalink: /releases/
---

# Releases

## v0.1.0 — Initial Release

Migrates the Data Dictionary documentation site from [reso-tools](https://github.com/RESOStandards/reso-tools) into a standalone repository with significant enhancements.

### Migration and XLSX Refactor (#1)

- Moved static site generator (`generate.mjs`) from reso-tools `.github/pages/dd-generator/`
- Refactored data ingestion from CSV to XLSX using the `xlsx` library
- Reference sheets fetched at build time from [web-api-commander](https://github.com/RESOStandards/web-api-commander)
- Excel date serial numbers converted to M/D/YYYY format
- GitHub Pages workflow with three triggers:
  - `repository_dispatch` from commander repo when reference sheets change
  - Weekly scheduled build (Monday 6am UTC) for analytics refresh
  - Manual `workflow_dispatch` for on-demand builds
- Project-specific `CLAUDE.md` with coding standards
- Biome linter with Lefthook pre-commit hooks
- Jekyll + Pagefind for site build and search

### Shared Lookup Pages and Navigation (#2)

- **Lookup index page** (`/DD2.0/lookups/`) — card grid of all lookup types with value and field counts
- **LookupName pages** (`/DD2.0/lookups/{LookupName}/`) — values table with filter, "Used By" section listing all resource/field combinations
- **Shared lookup value pages** (`/DD2.0/lookups/{LookupName}/{Value}/`) — value details, metadata, "Used By" table with per-field usage stats
- Field detail pages link lookups to shared lookup pages instead of per-field duplicates
- Removed per-field duplicate lookup value pages (reduced page count by ~50%)
- **Sidebar navigation**:
  - Added Lookups section with flat list of all LookupNames
  - Renamed Cross Reference to Browse By
  - Browse By section lists Payload, Property Type, Element Status, Version Added
- Table filter input on Browse By value pages and LookupName pages
- Usage column centered across all table types
- Pluralization fixes for singular/plural counts
- "Definition" label on resource, field and lookup page callouts
- "Group" label appended to group headings
- Updated header navigation: Home, RESO Tools, RESO.org

# RESO Data Dictionary Documentation

Static site generator for the [RESO Data Dictionary](https://dd.reso.org) documentation. Produces a browsable, searchable reference for DD fields, resources, lookups and cross-references across all published versions.

## Features

- Multi-version documentation (DD 1.7, 2.0, 2.1)
- Resource and field detail pages with usage/adoption statistics
- Shared lookup pages organized by LookupName
- Browse By dimensions (Payload, Property Type, Element Status, Version Added)
- Sortable tables, inline search filters and grouped field views
- Dark/light theme toggle
- Full-text search via [Pagefind](https://pagefind.app)
- Mobile-optimized layout with sticky headers

## Quick Start

```bash
npm install
npm run fetch-data   # Download XLSX reference sheets
npm run generate     # Generate static HTML
```

The generated site is written to `dd-output/`.

## Data Sources

- **Reference sheets**: XLSX files fetched from the [web-api-commander](https://github.com/RESOStandards/web-api-commander) repo
- **Usage statistics**: Adoption data fetched from the RESO aggregation API (requires credentials)

## Deployment

The site is built and deployed automatically via GitHub Actions:

| Trigger | Purpose |
|---------|---------|
| `repository_dispatch` | Rebuild when reference sheets change in the commander repo |
| Weekly cron (Monday 6am UTC) | Refresh adoption/usage analytics |
| `workflow_dispatch` | Manual on-demand builds |

## Linting

```bash
npm run lint        # Check with Biome
npm run lint:fix    # Auto-fix
```

## License

See [LICENSE](LICENSE).

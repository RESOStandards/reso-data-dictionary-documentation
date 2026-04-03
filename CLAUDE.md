# CLAUDE.md — RESO Data Dictionary Documentation

## Project overview

Static site generator for RESO Data Dictionary documentation. Reads XLSX reference sheets and usage analytics to produce a browsable, searchable documentation site for DD fields, resources, lookups and cross-references.

## Common commands

```bash
npm run fetch-data          # Download XLSX reference sheets from commander repo
npm run generate            # Generate static HTML from XLSX data
```

## Architecture

- **Generator**: Single `generate.mjs` script (Node.js, ESM)
- **Data source**: XLSX reference sheets fetched from [web-api-commander](https://github.com/RESOStandards/web-api-commander) repo
- **Analytics**: Usage/adoption stats fetched from RESO aggregation API at build time
- **Site build**: Jekyll for page layout, Pagefind for client-side search
- **Deployment**: GitHub Pages via GitHub Actions

### Build triggers

- `repository_dispatch` from commander repo when reference sheets change
- Weekly scheduled build (Monday 6am UTC) to refresh analytics data
- Manual `workflow_dispatch` for on-demand builds

### File structure

| Path | Purpose |
|------|---------|
| `generate.mjs` | Static site generator — all HTML, CSS and JS output |
| `fetch-data.mjs` | Downloads XLSX reference sheets from commander repo |
| `dd-data/` | XLSX reference sheets (fetched at build time, gitignored) |
| `dd-output/` | Generated HTML pages (gitignored) |
| `_config.yml` | Jekyll configuration |
| `Gemfile` | Jekyll dependencies |
| `_layouts/`, `_includes/`, `assets/` | Jekyll site templates and assets |

### Generator internals

- CSS is embedded in `getPageCSS()`, browser JS in `getPageJS()`
- Page templates in `wrapPage()` and individual page generator functions
- All styling and interactivity changes happen in `generate.mjs` — no separate CSS/JS files

## Coding standards

- **Paradigm**: Functional and declarative. Use `map`, `filter`, `reduce`, `flatMap`.
- **Immutability**: Use `const` always. Avoid `let` and `var`. Do not mutate objects/arrays.
- **Functions**: Always use arrow functions. Compose small, pure functions.
- **Naming**: camelCase for variables/functions, PascalCase for types/interfaces.
- **Async**: Use `async/await`. Use the native `fetch` API (Node 22+).

## Prohibitions

- DO NOT use classes or `this`.
- DO NOT use `any`. Use `unknown` and narrow with type guards.
- DO NOT use hardcoded string constants inline. Define named constants at the top of the file.

## Style conventions

- Chicago Manual of Style for prose, no serial comma
- No parenthetical terms in documentation (e.g., show "Property Resource" not "Property Resource (Res)")

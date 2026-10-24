// Search ranking for the generated site.
//
// The build weights each page for Pagefind, and the search box puts
// exact-name matches in a fixed order on top of Pagefind's results. Both
// live here so the build, the browser and the tests share one copy.
//
// Pagefind weights run from 0 to 10. Resource, field and lookup value
// pages index their name in a hidden span, weighted so an exact name
// query finds that page first. Pages outside the current version carry a
// lower name weight. A field page's name weight also scales with how
// widely its resource is used, so a field repeated across resources
// (Property and Building, or ListingKey on Property, Showing and others)
// ranks by its resource. A resource without usage data ranks lowest.

export const SEARCH_WEIGHT_MAX = 10;
export const SEARCH_CURRENT_VERSION = '2.1';
export const SEARCH_OTHER_VERSION_DEMOTION = 4;
export const SEARCH_RESOURCE_DEMOTION_MAX = 3;

const round2 = n => Math.round(n * 100) / 100;
const share = (count, total) => (count != null && total ? Math.min(count / total, 1) : 0);

/**
 * A field page's text weight: 1 is no recorded use and 10 is every
 * reporting organization. A field without usage data stays at 1, so its
 * text keeps counting but never outranks a field that is in use.
 */
export const searchAdoptionWeight = (recipients, totalProviders) => round2(1 + (SEARCH_WEIGHT_MAX - 1) * share(recipients, totalProviders));

/** A resource's reach: the organizations receiving its most widely sent field. */
export const resourceReach = resourceStats =>
  Object.entries(resourceStats ?? {}).reduce(
    (max, [key, stats]) => (key === 'lookups' || !stats?.recipients ? max : Math.max(max, stats.recipients)),
    0,
  );

/** Each resource's reach as a share of all organizations. Resources without usage data are left out. */
export const resourceUsageShares = (usageStats, totalProviders) =>
  Object.fromEntries(Object.entries(usageStats ?? {}).map(([name, stats]) => [name, share(resourceReach(stats), totalProviders)]));

/**
 * The weight of a page's hidden name span. Resource and lookup pages pass
 * only a version. Field pages also pass their resource's usage share, 0
 * when the resource has no usage data.
 */
export const searchNameWeight = (version, resourceShare) =>
  round2(
    SEARCH_WEIGHT_MAX -
      (version === SEARCH_CURRENT_VERSION ? 0 : SEARCH_OTHER_VERSION_DEMOTION) -
      (resourceShare == null ? 0 : SEARCH_RESOURCE_DEMOTION_MAX * (1 - resourceShare)),
  );

/**
 * The display order for the search results loaded so far, as indices into
 * `hrefs`. Exact-name matches go first: the current version, then by page
 * kind (resource, field, lookup list, lookup value, other), then by
 * resource usage, then in Pagefind's order. Everything else keeps
 * Pagefind's order below them.
 *
 * The page embeds this function's source, so it must not refer to
 * anything outside itself.
 */
export const orderSearchResults = (hrefs, query, opts) => {
  const normalize = s => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const decode = s => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  const KIND_RANK = { resource: 0, field: 1, lookupList: 2, lookupValue: 3, other: 4 };
  const describe = href => {
    const match = /\/DD(\d+\.\d+)\/([^?#]*)/.exec(href ?? '');
    if (!match) return null;
    const segments = match[2]
      .replace(/index\.html$/, '')
      .split('/')
      .filter(Boolean)
      .map(decode);
    if (segments.length === 0) return null;
    const [first, second, third] = segments;
    const kind =
      first === 'lookups'
        ? segments.length === 2
          ? 'lookupList'
          : segments.length === 3
            ? 'lookupValue'
            : 'other'
        : first === 'xref' || first === 'about'
          ? 'other'
          : segments.length === 1
            ? 'resource'
            : segments.length === 2
              ? 'field'
              : 'other';
    const resource = kind === 'resource' || kind === 'field' ? first : null;
    const name = kind === 'lookupValue' ? third : kind === 'lookupList' || kind === 'field' ? second : segments[segments.length - 1];
    return { version: match[1], kind, resource, name: normalize(name) };
  };

  const indices = hrefs.map((_, i) => i);
  const q = normalize(query ?? '');
  if (!q) return indices;
  const pages = hrefs.map(describe);
  const isExact = i => pages[i]?.name === q;
  const shares = opts?.resourceShares ?? {};
  const usage = i => (pages[i].resource == null ? 0 : (shares[pages[i].resource] ?? 0));
  const key = i => [pages[i].version === opts?.currentVersion ? 0 : 1, KIND_RANK[pages[i].kind], -usage(i), i];
  const compare = (a, b) => {
    const [ka, kb] = [key(a), key(b)];
    const diff = ka.findIndex((v, n) => v !== kb[n]);
    return diff < 0 ? 0 : ka[diff] - kb[diff];
  };
  return [...indices.filter(isExact).sort(compare), ...indices.filter(i => !isExact(i))];
};

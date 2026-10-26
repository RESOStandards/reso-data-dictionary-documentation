import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  SEARCH_CURRENT_VERSION,
  SEARCH_WEIGHT_MAX,
  orderSearchResults,
  resourceReach,
  resourceUsageShares,
  searchAdoptionWeight,
  searchNameWeight,
} from './search-ranking.mjs';

describe('searchAdoptionWeight', () => {
  it('maps adoption onto 1 to 10, with 10 at every organization', () => {
    assert.equal(searchAdoptionWeight(420, 420), 10);
    assert.equal(searchAdoptionWeight(210, 420), 5.5);
    assert.equal(searchAdoptionWeight(0, 420), 1);
  });

  it('keeps a field without usage data at the floor of 1, never 0', () => {
    assert.equal(searchAdoptionWeight(undefined, 420), 1);
    assert.equal(searchAdoptionWeight(null, 420), 1);
    assert.equal(searchAdoptionWeight(100, 0), 1);
    assert.equal(searchAdoptionWeight(100, undefined), 1);
  });

  it('never exceeds the maximum', () => {
    assert.equal(searchAdoptionWeight(500, 420), SEARCH_WEIGHT_MAX);
  });
});

describe('resourceReach', () => {
  it('is the recipient count of the most widely sent field', () => {
    assert.equal(resourceReach({ ListPrice: { recipients: 420 }, YearBuilt: { recipients: 418 } }), 420);
  });

  it('skips the lookups key and fields without recipients', () => {
    assert.equal(resourceReach({ lookups: { recipients: 999 }, A: { recipients: 5 }, B: {}, C: null }), 5);
  });

  it('is 0 for a resource with no usage data', () => {
    assert.equal(resourceReach(undefined), 0);
    assert.equal(resourceReach({}), 0);
  });
});

describe('resourceUsageShares', () => {
  const stats = { Property: { ListPrice: { recipients: 420 } }, Media: { MediaKey: { recipients: 210 } } };

  it('gives each resource its reach as a share of all organizations', () => {
    assert.deepEqual(resourceUsageShares(stats, 420), { Property: 1, Media: 0.5 });
  });

  it('leaves out resources without usage data, so callers treat them as 0', () => {
    assert.equal(resourceUsageShares(stats, 420).Building, undefined);
  });

  it('is empty without usage data or a total', () => {
    assert.deepEqual(resourceUsageShares(null, 420), {});
    assert.deepEqual(resourceUsageShares(stats, 0), { Property: 0, Media: 0 });
  });
});

describe('searchNameWeight', () => {
  it('gives current-version resource and lookup pages the full weight', () => {
    assert.equal(searchNameWeight(SEARCH_CURRENT_VERSION), 10);
  });

  it('demotes pages outside the current version', () => {
    assert.equal(searchNameWeight('2.0'), 6);
    assert.equal(searchNameWeight('1.7'), 6);
  });

  it('scales a field page by its resource usage', () => {
    assert.equal(searchNameWeight(SEARCH_CURRENT_VERSION, 1), 10);
    assert.equal(searchNameWeight(SEARCH_CURRENT_VERSION, 0.5), 8.5);
    assert.equal(searchNameWeight(SEARCH_CURRENT_VERSION, 0), 7);
  });

  it('combines both demotions and stays inside 0 to 10', () => {
    assert.equal(searchNameWeight('2.0', 0), 3);
    const weights = [0, 0.3, 1].flatMap(share => ['1.7', '2.0', '2.1'].map(v => searchNameWeight(v, share)));
    assert.ok(weights.every(w => w >= 0 && w <= SEARCH_WEIGHT_MAX));
  });
});

describe('orderSearchResults', () => {
  const opts = { currentVersion: '2.1', resourceShares: { Property: 1, Member: 0.9, Showing: 0.4 } };
  const order = (hrefs, query) => orderSearchResults(hrefs, query, opts).map(i => hrefs[i]);

  it('puts the Property field above the Building field of the same name', () => {
    const hrefs = ['/DD2.1/Building/TaxAnnualAmount/', '/DD2.1/Property/TaxAnnualAmount/', '/DD2.1/Property/TaxAnnualAmountPerSquareFoot/'];
    assert.deepEqual(order(hrefs, 'taxannualamount'), [
      '/DD2.1/Property/TaxAnnualAmount/',
      '/DD2.1/Building/TaxAnnualAmount/',
      '/DD2.1/Property/TaxAnnualAmountPerSquareFoot/',
    ]);
  });

  it('orders same-named fields by resource usage, unknown resources last', () => {
    const hrefs = ['/DD2.1/Showing/ListingKey/', '/DD2.1/Teams/ListingKey/', '/DD2.1/Property/ListingKey/', '/DD2.1/Member/ListingKey/'];
    assert.deepEqual(order(hrefs, 'listingkey'), [
      '/DD2.1/Property/ListingKey/',
      '/DD2.1/Member/ListingKey/',
      '/DD2.1/Showing/ListingKey/',
      '/DD2.1/Teams/ListingKey/',
    ]);
  });

  it('puts the current version first and keeps the other versions in their order', () => {
    const hrefs = ['/DD1.7/Property/CurrentUse/', '/DD2.0/Property/CurrentUse/', '/DD2.1/Property/CurrentUse/'];
    assert.deepEqual(order(hrefs, 'currentuse'), [
      '/DD2.1/Property/CurrentUse/',
      '/DD1.7/Property/CurrentUse/',
      '/DD2.0/Property/CurrentUse/',
    ]);
  });

  it('ranks the current version above resource usage', () => {
    const hrefs = ['/DD2.0/Property/CrossStreet/', '/DD2.1/Building/CrossStreet/'];
    assert.deepEqual(order(hrefs, 'crossstreet'), ['/DD2.1/Building/CrossStreet/', '/DD2.0/Property/CrossStreet/']);
  });

  it('moves exact-name matches above longer names that start the same way', () => {
    const hrefs = ['/DD2.1/Property/ListPriceLow/', '/DD2.1/Property/ListPrice/'];
    assert.deepEqual(order(hrefs, 'listprice'), ['/DD2.1/Property/ListPrice/', '/DD2.1/Property/ListPriceLow/']);
  });

  it('keeps Pagefind order for everything that is not an exact match', () => {
    const hrefs = ['/DD2.1/Building/YearBuiltEffective/', '/DD2.1/Property/YearEstablished/', '/DD2.1/Building/YearBuiltDetails/'];
    assert.deepEqual(order(hrefs, 'year'), hrefs);
  });

  it('orders a resource page, then its field, then a lookup list, then a lookup value of the same name', () => {
    const hrefs = ['/DD2.1/lookups/Media/Media/', '/DD2.1/lookups/Media/', '/DD2.1/Property/Media/', '/DD2.1/Media/'];
    assert.deepEqual(order(hrefs, 'media'), [
      '/DD2.1/Media/',
      '/DD2.1/Property/Media/',
      '/DD2.1/lookups/Media/',
      '/DD2.1/lookups/Media/Media/',
    ]);
  });

  it('matches URL-encoded lookup values on their normalized name', () => {
    const hrefs = ['/DD2.1/lookups/ArchitecturalStyle/Other/', '/DD2.1/lookups/ArchitecturalStyle/See%20Remarks/'];
    assert.deepEqual(order(hrefs, 'seeremarks'), [
      '/DD2.1/lookups/ArchitecturalStyle/See%20Remarks/',
      '/DD2.1/lookups/ArchitecturalStyle/Other/',
    ]);
  });

  it('survives a malformed percent sign in a URL', () => {
    const hrefs = ['/DD2.1/lookups/Discount/100%/', '/DD2.1/Property/ListPrice/'];
    assert.deepEqual(order(hrefs, 'listprice'), ['/DD2.1/Property/ListPrice/', '/DD2.1/lookups/Discount/100%/']);
  });

  it('reads absolute URLs, index.html, query strings and hashes', () => {
    const hrefs = ['https://dd.reso.org/DD2.1/Building/TaxLot/index.html', 'https://dd.reso.org/DD2.1/Property/TaxLot/?x=1#top'];
    assert.deepEqual(order(hrefs, 'taxlot'), [hrefs[1], hrefs[0]]);
  });

  it('leaves the order alone without a query', () => {
    const hrefs = ['/DD2.1/Building/TaxLot/', '/DD2.1/Property/TaxLot/'];
    assert.deepEqual(order(hrefs, ''), hrefs);
  });

  it('is idempotent, so re-running it on its own output changes nothing', () => {
    const hrefs = ['/DD1.7/Property/TaxLot/', '/DD2.1/Building/TaxLot/', '/DD2.1/Property/TaxLotSize/', '/DD2.1/Property/TaxLot/'];
    const once = order(hrefs, 'taxlot');
    assert.deepEqual(order(once, 'taxlot'), once);
  });

  it('works when its source is evaluated alone, the way the page embeds it', () => {
    const embedded = runInNewContext(`(${orderSearchResults.toString()})`);
    const hrefs = ['/DD2.1/Building/TaxLot/', '/DD2.0/Property/TaxLot/', '/DD2.1/Property/TaxLot/'];
    // Array.from copies the result out of the vm's realm so the comparison is by value.
    assert.deepEqual(Array.from(embedded(hrefs, 'taxlot', opts)), orderSearchResults(hrefs, 'taxlot', opts));
  });
});

import test from 'node:test'
import assert from 'node:assert/strict'
import { isRecentListing, MAX_LISTING_AGE_DAYS, wasJobSourceChecked } from './job-lifecycle.mjs'

const sources = [
  { id: 'portal-search-a', provider: 'portal.test', url: 'https://portal.test/search/a' },
  { id: 'portal-search-b', provider: 'portal.test', url: 'https://portal.test/search/b' },
  { id: 'regional-feed', provider: 'regional.test', url: 'https://regional.test/feed' },
]

test('Erfolg einer anderen Suche desselben Providers prüft eine fehlgeschlagene Quelle nicht ab', () => {
  const job = {
    sourceId: 'portal-search-a',
    discoveryUrl: 'https://portal.test/search/a',
    sourceUrl: 'https://portal.test/jobs/123',
    provider: 'portal.test',
  }
  assert.equal(wasJobSourceChecked(job, sources, new Set(['https://portal.test/search/b'])), false)
})

test('akzeptiert eine erfolgreiche stabile sourceId/sourceUrl-Zuordnung', () => {
  const job = {
    sourceId: 'portal-search-b',
    discoveryUrl: 'https://portal.test/search/b',
    sourceUrl: 'https://portal.test/jobs/456',
  }
  assert.equal(wasJobSourceChecked(job, sources, new Set(['https://portal.test/search/b'])), true)
})

test('Feed-Erfolg ersetzt keinen fehlgeschlagenen konkreten Profilabruf', () => {
  const job = {
    sourceId: 'regional-feed',
    discoveryUrl: 'https://regional.test/company/example',
    sourceUrl: 'https://regional.test/company/example#heading-42',
  }
  assert.equal(wasJobSourceChecked(job, sources, new Set(['https://regional.test/feed'])), false)
  assert.equal(wasJobSourceChecked(job, sources, new Set(['https://regional.test/feed', 'https://regional.test/company/example'])), true)
})

test('behandelt sehr alte, datierte Inserate als nicht mehr sichtbar', () => {
  const reference = '2026-08-31T12:00:00Z'
  assert.equal(isRecentListing({ postedAt: '2020-06-01' }, reference), false)
  assert.equal(isRecentListing({ postedAt: '2026-08-01' }, reference), true)
  assert.equal(isRecentListing({}, reference), true)
  assert.equal(MAX_LISTING_AGE_DAYS, 400)
})

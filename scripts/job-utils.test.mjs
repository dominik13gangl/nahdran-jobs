import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalKey, dedupeJobs, jsonLdObjects, scoreJob } from './job-utils.mjs'

test('normalisiert geschlechtsneutrale Titel für Dubletten', () => {
  const a = { title: 'Verkäufer:in (m/w/d)', company: 'BILLA AG', location: 'Feldbach' }
  const b = { title: 'Verkäufer/in', company: 'Billa AG', location: 'Feldbach' }
  assert.equal(canonicalKey(a), canonicalKey(b))
})

test('behält bei Dubletten den vollständigeren Datensatz', () => {
  const base = { title: 'Büroassistenz', company: 'Test GmbH', location: 'Gnas' }
  const result = dedupeJobs([{ ...base, source: 'Portal' }, { ...base, source: 'Firma', salary: '€ 1.200', requirements: ['MS Office'] }])
  assert.equal(result.length, 1)
  assert.equal(result[0].source, 'Firma')
})

test('bevorzugt kurze Teilzeit am Vormittag', () => {
  const ideal = scoreJob({ title: 'Büroassistenz', employmentType: ['Teilzeit'], schedule: 'Mo-Fr vormittags bis 13:00', morningFriendly: true, weekendRequired: false, driveMinutes: 12 })
  const poor = scoreJob({ title: 'Elektro-Leitung', employmentType: ['Vollzeit'], schedule: 'Wochenenddienst', morningFriendly: false, weekendRequired: true, driveMinutes: 45 })
  assert.ok(ideal > poor)
})

test('liest JobPosting aus verschachteltem JSON-LD', () => {
  const html = '<script type="application/ld+json">{"@graph":[{"@type":"JobPosting","title":"Test"}]}</script>'
  assert.equal(jsonLdObjects(html).length, 1)
})

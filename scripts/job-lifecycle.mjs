// Job ads are normally open for weeks, not years. 400 days is deliberately
// conservative: it tolerates long-running/evergreen listings while preventing
// clearly stale records (for example from 2020) from remaining visible forever.
export const MAX_LISTING_AGE_DAYS = 400

export function wasJobSourceChecked(job, sources, successfulUrls) {
  const success = new Set([...successfulUrls].map(normalizedSourceUrl).filter(Boolean))
  const sourceById = new Map(sources.filter(source => source.id).map(source => [source.id, source]))
  const configuredSource = job.sourceId ? sourceById.get(job.sourceId) : undefined
  const discoveryUrl = normalizedSourceUrl(job.discoveryUrl)
  const sourceUrl = normalizedSourceUrl(job.sourceUrl)

  if (configuredSource) {
    const configuredUrl = normalizedSourceUrl(configuredSource.url)
    // A feed may discover jobs on many concrete profile pages. In that case a
    // successful feed request must not stand in for a failed profile request.
    const identityMatches = !discoveryUrl || discoveryUrl === configuredUrl
    if (identityMatches && success.has(configuredUrl)) return true
  }

  // Exact concrete URLs are safe fallbacks for legacy jobs without sourceId.
  // Provider/domain equality is intentionally not sufficient.
  return Boolean((discoveryUrl && success.has(discoveryUrl)) || (sourceUrl && success.has(sourceUrl)))
}

export function isRecentListing(job, referenceTime, maxAgeDays = MAX_LISTING_AGE_DAYS) {
  if (!job.postedAt) return true
  const postedAt = new Date(job.postedAt).getTime()
  const reference = new Date(referenceTime).getTime()
  if (!Number.isFinite(postedAt) || !Number.isFinite(reference)) return true
  return reference - postedAt <= maxAgeDays * 86400000
}

function normalizedSourceUrl(value) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    url.hash = ''
    return url.href
  } catch {
    return String(value)
  }
}

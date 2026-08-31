export type EmploymentType = 'Teilzeit' | 'Geringfügig' | 'Vollzeit' | 'Unbekannt'

export type MatchTier = 'top' | 'review'

export type Job = {
  id: string
  title: string
  company: string
  location: string
  distanceKm: number
  driveMinutes: number
  distanceEstimated?: boolean
  employmentType: EmploymentType[]
  hoursPerWeek?: number
  schedule: string
  morningFriendly: boolean
  weekendRequired: boolean
  salary: string
  salaryMonthlyFullTime?: number
  fitScore: number
  fitReasons: string[]
  concerns: string[]
  requirements: string[]
  tasks: string[]
  contact?: { name?: string; phone?: string; email?: string }
  source: string
  sourceUrl: string
  applyUrl: string
  provider?: string
  discoveryUrl?: string
  sourceJobId?: string
  postedAt?: string
  expiresAt?: string
  checkedAt: string
  status: 'active' | 'uncertain'
  matchTier?: MatchTier
  missingChecks?: number
}

export type SourceStat = {
  id: string
  name: string
  provider: string
  kind: 'discovery' | 'monitor'
  status: 'ok' | 'failed'
  found: number
  checkedAt: string
  note?: string
}

export type JobsStats = {
  raw: number
  unique: number
  recommended: number
  review: number
  excluded: number
  successfulSearches: number
  totalSearches: number
  providerCount: number
  providersWithJobs?: number
}

export type JobsPayload = {
  generatedAt: string
  origin: string
  sourceCount: number
  sourceProviderCount?: number
  sourceJobProviderCount?: number
  sourceProviders?: string[]
  stats?: JobsStats
  sourceStats?: SourceStat[]
  jobs: Job[]
}

export type EmploymentType = 'Teilzeit' | 'Geringfügig' | 'Vollzeit'

export type Job = {
  id: string
  title: string
  company: string
  location: string
  distanceKm: number
  driveMinutes: number
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
  postedAt?: string
  expiresAt?: string
  checkedAt: string
  status: 'active' | 'uncertain'
}

export type JobsPayload = {
  generatedAt: string
  origin: string
  sourceCount: number
  jobs: Job[]
}

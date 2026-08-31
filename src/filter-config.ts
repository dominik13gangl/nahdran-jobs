export type FilterState = {
  query: string
  location: string
  maxDrive: number
  morningOnly: boolean
  partTimeOnly: boolean
}

export const defaultFilters: FilterState = {
  query: '', location: '', maxDrive: 40, morningOnly: false, partTimeOnly: true,
}

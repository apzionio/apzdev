'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { MarketFilters as Filters } from '@/lib/services/market-service'

interface MarketFiltersProps {
  filters: Filters
  onFiltersChange: (filters: Filters) => void
}

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Upcoming' },
  { value: 'resolved', label: 'Resolved' },
]

export function MarketFilters({ filters, onFiltersChange }: MarketFiltersProps) {
  const handleStatusChange = (status: string) => {
    onFiltersChange({
      ...filters,
      status: status as Filters['status'],
    })
  }

  const handleSearchChange = (search: string) => {
    onFiltersChange({
      ...filters,
      search: search || undefined,
    })
  }

  const toggleGasSponsored = () => {
    onFiltersChange({
      ...filters,
      isGasSponsored: filters.isGasSponsored ? undefined : true,
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Status filter */}
      <div className="flex gap-2">
        {statusOptions.map((option) => (
          <Button
            key={option.value}
            variant={filters.status === option.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleStatusChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Search input */}
      <div className="flex-1 min-w-[200px] max-w-[300px]">
        <Input
          placeholder="Search markets..."
          value={filters.search || ''}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      {/* Gas sponsored filter */}
      <Badge
        variant={filters.isGasSponsored ? 'default' : 'outline'}
        className="cursor-pointer"
        onClick={toggleGasSponsored}
      >
        {filters.isGasSponsored ? 'FREE GAS Only' : 'All Markets'}
      </Badge>
    </div>
  )
}

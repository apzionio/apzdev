'use client'

import { useEffect, useState } from 'react'
import { MarketGrid } from './MarketGrid'
import { MarketFilters } from './MarketFilters'
import { getMarkets, type MarketFilters as Filters } from '@/lib/services/market-service'
import type { Market } from '@/types/market'

export function MarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>({
    status: 'active',
    limit: 20,
  })

  useEffect(() => {
    async function loadMarkets() {
      setIsLoading(true)
      try {
        const data = await getMarkets(filters)
        setMarkets(data)
      } catch (error) {
        console.error('Failed to load markets:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadMarkets()
  }, [filters])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prediction Markets</h1>
          <p className="text-muted-foreground">
            Trade on real-world events with gas-free transactions
          </p>
        </div>
      </div>

      <MarketFilters filters={filters} onFiltersChange={setFilters} />

      <MarketGrid markets={markets} isLoading={isLoading} />
    </div>
  )
}

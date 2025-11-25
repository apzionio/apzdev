'use client'

import { MarketCard } from './MarketCard'
import type { Market } from '@/types/market'

interface MarketGridProps {
  markets: Market[]
  isLoading?: boolean
}

export function MarketGrid({ markets, isLoading }: MarketGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-48 rounded-lg bg-muted animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (markets.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No markets found</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {markets.map((market) => (
        <MarketCard key={market.id} market={market} />
      ))}
    </div>
  )
}

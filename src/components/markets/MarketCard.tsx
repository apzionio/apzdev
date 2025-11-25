'use client'

import Link from 'next/link'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Market } from '@/types/market'

interface MarketCardProps {
  market: Market
}

export function MarketCard({ market }: MarketCardProps) {
  const isActive = market.status === 'active'
  const isGasSponsored = market.is_gas_sponsored

  // Calculate YES probability (simple placeholder - will be replaced with real AMM calculation)
  const yesProb = market.initial_price * 100

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M APT`
    }
    if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K APT`
    }
    return `${volume.toFixed(2)} APT`
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'TBD'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm line-clamp-2">{market.title}</h3>
            <div className="flex flex-col gap-1">
              {isGasSponsored && (
                <Badge variant="secondary" className="bg-green-500/10 text-green-500 text-xs">
                  FREE GAS
                </Badge>
              )}
              {market.category && (
                <Badge variant="outline" className="text-xs">
                  {market.category}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pb-2">
          {market.market_type === 'binary' ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">YES</span>
                <span className="font-bold text-green-500">{yesProb.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${yesProb}%` }}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">NO</span>
                <span className="font-bold text-red-500">{(100 - yesProb).toFixed(0)}%</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {market.options?.length || 0} options
            </div>
          )}
        </CardContent>

        <CardFooter className="pt-2 flex justify-between text-xs text-muted-foreground">
          <span>Vol: {formatVolume(market.total_volume)}</span>
          <span>Ends: {formatDate(market.end_date || market.trading_end)}</span>
        </CardFooter>
      </Card>
    </Link>
  )
}

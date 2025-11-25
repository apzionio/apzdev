'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TradingPanel } from '@/components/trading/TradingPanel'
import { getMarketById } from '@/lib/services/market-service'
import type { Market } from '@/types/market'

interface MarketDetailPageProps {
  marketId: string
}

export function MarketDetailPage({ marketId }: MarketDetailPageProps) {
  const [market, setMarket] = useState<Market | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadMarket() {
      setIsLoading(true)
      try {
        const data = await getMarketById(marketId)
        setMarket(data)
      } catch (error) {
        console.error('Failed to load market:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadMarket()
  }, [marketId])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-96 bg-muted animate-pulse rounded-lg" />
        <div className="h-96 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  if (!market) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold">Market not found</h2>
        <p className="text-muted-foreground mt-2">
          The market you&apos;re looking for doesn&apos;t exist.
        </p>
      </div>
    )
  }

  const yesProb = market.initial_price * 100

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Market Info */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <CardTitle className="text-xl">{market.title}</CardTitle>
                {market.description && (
                  <p className="text-muted-foreground">{market.description}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {market.is_gas_sponsored && (
                  <Badge className="bg-green-500/10 text-green-500">
                    FREE GAS
                  </Badge>
                )}
                <Badge variant="outline">
                  {market.status.toUpperCase()}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Volume</p>
                <p className="font-semibold">{market.total_volume.toFixed(2)} APT</p>
              </div>
              <div>
                <p className="text-muted-foreground">Liquidity</p>
                <p className="font-semibold">{market.total_liquidity.toFixed(2)} APT</p>
              </div>
              <div>
                <p className="text-muted-foreground">Trades</p>
                <p className="font-semibold">{market.total_trades}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Traders</p>
                <p className="font-semibold">{market.unique_traders}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Probability Display */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Market Odds</CardTitle>
          </CardHeader>
          <CardContent>
            {market.market_type === 'binary' ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="font-medium">YES</span>
                  </div>
                  <span className="text-2xl font-bold text-green-500">
                    {yesProb.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-4">
                  <div
                    className="bg-green-500 h-4 rounded-full transition-all"
                    style={{ width: `${yesProb}%` }}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="font-medium">NO</span>
                  </div>
                  <span className="text-2xl font-bold text-red-500">
                    {(100 - yesProb).toFixed(1)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {market.options?.map((option, index) => (
                  <div key={index} className="flex justify-between items-center py-2 border-b last:border-0">
                    <span>{option}</span>
                    <span className="font-semibold">
                      {market.option_pools?.[index] ?
                        ((market.option_pools[index] / market.option_pools.reduce((a, b) => a + b, 0)) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Market Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Category</dt>
                <dd>{market.category || 'Uncategorized'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Market Type</dt>
                <dd className="capitalize">{market.market_type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">System</dt>
                <dd>{market.market_system}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Resolution Source</dt>
                <dd className="capitalize">{market.resolution_source || 'Manual'}</dd>
              </div>
              {market.end_date && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ends</dt>
                  <dd>{new Date(market.end_date).toLocaleString()}</dd>
                </div>
              )}
              {market.market_object_address && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Contract</dt>
                  <dd className="font-mono text-xs truncate max-w-[200px]">
                    {market.market_object_address}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Trading Panel */}
      <div>
        <TradingPanel market={market} />
      </div>
    </div>
  )
}

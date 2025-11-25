'use client'

import { useState } from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Market } from '@/types/market'

interface TradingPanelProps {
  market: Market
}

export function TradingPanel({ market }: TradingPanelProps) {
  const { connected, account } = useWallet()
  const [amount, setAmount] = useState('')
  const [selectedOption, setSelectedOption] = useState<number>(0) // 0 = YES, 1 = NO
  const [isLoading, setIsLoading] = useState(false)

  const isGasSponsored = market.is_gas_sponsored
  const isTradingEnabled = market.status === 'active'

  // Calculate estimated tokens based on AMM formula (simplified)
  const calculateEstimate = () => {
    const aptAmount = parseFloat(amount) || 0
    if (aptAmount <= 0) return 0

    // Simple constant product estimate (will be replaced with actual AMM calculation)
    const yesPool = market.total_liquidity * market.initial_price
    const noPool = market.total_liquidity * (1 - market.initial_price)
    const selectedPool = selectedOption === 0 ? yesPool : noPool

    // tokens = (aptAmount * selectedPool) / (aptAmount + selectedPool)
    const estimate = (aptAmount * selectedPool) / (aptAmount + selectedPool)
    return estimate.toFixed(4)
  }

  const handleTrade = async () => {
    if (!connected || !account || !amount) return

    setIsLoading(true)
    try {
      if (isGasSponsored) {
        // Call sponsored transaction API
        const response = await fetch('/api/sponsor/bet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: account.address,
            marketId: market.id,
            marketAddress: market.market_object_address,
            optionIndex: selectedOption,
            amount: parseFloat(amount) * 100_000_000, // Convert to octas
          }),
        })

        if (!response.ok) {
          throw new Error('Sponsored transaction failed')
        }

        // Handle sponsored transaction flow
        const data = await response.json()
        console.log('Sponsored tx:', data)
        // TODO: Complete with user signature
      } else {
        // Regular transaction (user pays gas)
        console.log('Regular trade:', {
          option: selectedOption,
          amount,
        })
        // TODO: Implement regular transaction
      }
    } catch (error) {
      console.error('Trade failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isTradingEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trading</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            {market.status === 'pending' && 'Trading has not started yet'}
            {market.status === 'resolved' && 'This market has been resolved'}
            {market.status === 'cancelled' && 'This market has been cancelled'}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="sticky top-20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Trade</CardTitle>
          {isGasSponsored && (
            <Badge className="bg-green-500/10 text-green-500">
              FREE GAS
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="buy">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buy">Buy</TabsTrigger>
            <TabsTrigger value="sell">Sell</TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="space-y-4">
            {/* Option Selection */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={selectedOption === 0 ? 'default' : 'outline'}
                className={selectedOption === 0 ? 'bg-green-500 hover:bg-green-600' : ''}
                onClick={() => setSelectedOption(0)}
              >
                YES
              </Button>
              <Button
                variant={selectedOption === 1 ? 'default' : 'outline'}
                className={selectedOption === 1 ? 'bg-red-500 hover:bg-red-600' : ''}
                onClick={() => setSelectedOption(1)}
              >
                NO
              </Button>
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Amount (APT)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="0.1"
              />
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex gap-2">
              {[1, 5, 10, 50].map((val) => (
                <Button
                  key={val}
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(val.toString())}
                >
                  {val}
                </Button>
              ))}
            </div>

            {/* Estimate */}
            {amount && parseFloat(amount) > 0 && (
              <div className="p-3 bg-muted rounded-lg space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Est. Tokens</span>
                  <span className="font-medium">{calculateEstimate()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gas Fee</span>
                  <span className={isGasSponsored ? 'text-green-500' : ''}>
                    {isGasSponsored ? 'FREE' : '~0.01 APT'}
                  </span>
                </div>
              </div>
            )}

            {/* Trade Button */}
            {connected ? (
              <Button
                className="w-full"
                size="lg"
                onClick={handleTrade}
                disabled={!amount || parseFloat(amount) <= 0 || isLoading}
              >
                {isLoading ? 'Processing...' : `Buy ${selectedOption === 0 ? 'YES' : 'NO'}`}
              </Button>
            ) : (
              <Button className="w-full" size="lg" variant="outline" disabled>
                Connect Wallet to Trade
              </Button>
            )}
          </TabsContent>

          <TabsContent value="sell" className="space-y-4">
            <div className="text-center py-8 text-muted-foreground">
              Sell functionality coming soon
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

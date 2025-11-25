'use client'

import { Header } from '@/components/Header'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Wallet, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Position {
  id: string
  market_id: string
  option_id: string
  position_type: 'yes' | 'no'
  shares: number
  avg_entry_price: number
  realized_pnl: number
  unrealized_pnl: number
  created_at: string
  market?: {
    id: string
    question: string
    status: string
    resolution_value: number | null
  }
}

export default function PortfolioPage() {
  const { connected, account } = useWallet()
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalValue: 0,
    totalPnL: 0,
    activePositions: 0,
  })

  useEffect(() => {
    if (connected && account?.address) {
      fetchPositions(account.address.toString())
    } else {
      setPositions([])
      setLoading(false)
    }
  }, [connected, account])

  const fetchPositions = async (walletAddress: string) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('user_positions')
        .select(`
          *,
          market:markets(id, question, status, resolution_value)
        `)
        .eq('user_address', walletAddress)
        .gt('shares', 0)
        .order('created_at', { ascending: false })

      if (error) throw error

      setPositions(data || [])

      // Calculate stats
      const totalValue = (data || []).reduce((sum, p) => sum + (p.shares * (p.avg_entry_price || 0)), 0)
      const totalPnL = (data || []).reduce((sum, p) => sum + (p.realized_pnl || 0) + (p.unrealized_pnl || 0), 0)
      const activePositions = (data || []).filter(p => p.market?.status === 'active').length

      setStats({ totalValue, totalPnL, activePositions })
    } catch (err: unknown) {
      const error = err as { message?: string; code?: string; details?: string }
      console.error('Error fetching positions:', error?.message || error?.code || JSON.stringify(err))
    } finally {
      setLoading(false)
    }
  }

  if (!connected) {
    return (
      <main className="min-h-screen">
        <Header />
        <div className="container py-12">
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
            <Wallet className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
            <p className="text-muted-foreground mb-4">
              Connect your wallet to view your portfolio and positions
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <Header />
      <div className="container py-6">
        <h1 className="text-3xl font-bold mb-6">Portfolio</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${stats.totalValue.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total P&L
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold flex items-center gap-1 ${
                stats.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {stats.totalPnL >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                ${Math.abs(stats.totalPnL).toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Positions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.activePositions}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Positions List */}
        <Card>
          <CardHeader>
            <CardTitle>Your Positions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : positions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No positions yet</p>
                <Link href="/">
                  <Button>Explore Markets</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {positions.map((position) => (
                  <div
                    key={position.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <Link href={`/markets/${position.market_id}`}>
                        <h3 className="font-medium hover:underline">
                          {position.market?.question || 'Unknown Market'}
                        </h3>
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={position.position_type === 'yes' ? 'default' : 'secondary'}>
                          {position.position_type.toUpperCase()}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {position.shares.toFixed(2)} shares @ ${position.avg_entry_price?.toFixed(4) || '0.00'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">
                        ${(position.shares * (position.avg_entry_price || 0)).toFixed(2)}
                      </div>
                      <div className={`text-sm ${
                        (position.unrealized_pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {(position.unrealized_pnl || 0) >= 0 ? '+' : ''}
                        ${(position.unrealized_pnl || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

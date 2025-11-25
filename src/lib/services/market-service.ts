/**
 * Market Service
 *
 * Handles market data operations from Supabase
 */

import { supabase } from '@/lib/supabase'
import type { Market } from '@/types/market'

export interface MarketFilters {
  status?: 'pending' | 'active' | 'resolved' | 'cancelled'
  category?: string
  marketSystem?: string
  search?: string
  isGasSponsored?: boolean
  limit?: number
  offset?: number
}

/**
 * Fetch markets with filters
 */
export async function getMarkets(filters: MarketFilters = {}): Promise<Market[]> {
  let query = supabase
    .from('markets')
    .select('*')
    .order('created_at', { ascending: false })

  // Apply filters
  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  if (filters.category) {
    query = query.eq('category', filters.category)
  }

  if (filters.marketSystem) {
    query = query.eq('market_system', filters.marketSystem)
  }

  if (filters.isGasSponsored !== undefined) {
    query = query.eq('is_gas_sponsored', filters.isGasSponsored)
  }

  if (filters.search) {
    query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
  }

  if (filters.limit) {
    query = query.limit(filters.limit)
  }

  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching markets:', error)
    throw new Error(`Failed to fetch markets: ${error.message}`)
  }

  return data || []
}

/**
 * Fetch single market by ID
 */
export async function getMarketById(id: string): Promise<Market | null> {
  const { data, error } = await supabase
    .from('markets')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null // Not found
    }
    console.error('Error fetching market:', error)
    throw new Error(`Failed to fetch market: ${error.message}`)
  }

  return data
}

/**
 * Fetch market by object address
 */
export async function getMarketByAddress(address: string): Promise<Market | null> {
  const { data, error } = await supabase
    .from('markets')
    .select('*')
    .eq('market_object_address', address)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching market:', error)
    throw new Error(`Failed to fetch market: ${error.message}`)
  }

  return data
}

/**
 * Fetch child markets for V4 MOI parent
 */
export async function getChildMarkets(parentId: string): Promise<Market[]> {
  const { data, error } = await supabase
    .from('markets')
    .select('*')
    .eq('v4_parent_market_id', parentId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching child markets:', error)
    throw new Error(`Failed to fetch child markets: ${error.message}`)
  }

  return data || []
}

/**
 * Get available categories
 */
export async function getCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from('markets')
    .select('category')
    .not('category', 'is', null)

  if (error) {
    console.error('Error fetching categories:', error)
    return []
  }

  const categories = [...new Set(data?.map(m => m.category).filter(Boolean))]
  return categories as string[]
}

/**
 * Get market statistics
 */
export async function getMarketStats(): Promise<{
  totalMarkets: number
  activeMarkets: number
  totalVolume: number
  sponsoredMarkets: number
}> {
  const { data, error } = await supabase
    .from('markets')
    .select('status, total_volume, is_gas_sponsored')

  if (error) {
    console.error('Error fetching market stats:', error)
    return {
      totalMarkets: 0,
      activeMarkets: 0,
      totalVolume: 0,
      sponsoredMarkets: 0,
    }
  }

  return {
    totalMarkets: data?.length || 0,
    activeMarkets: data?.filter(m => m.status === 'active').length || 0,
    totalVolume: data?.reduce((sum, m) => sum + (m.total_volume || 0), 0) || 0,
    sponsoredMarkets: data?.filter(m => m.is_gas_sponsored).length || 0,
  }
}

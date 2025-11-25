export interface Market {
  id: string
  market_id: string | null
  market_object_address: string | null
  title: string
  description: string | null
  image_url: string | null
  market_type: 'binary' | 'multi_option'
  market_system: 'v3-binary' | 'v3-multi' | 'v4-binary' | 'v4-multi'
  marketplace_version: 'v3' | 'v4'
  contract_module_name: string | null
  category: string | null
  tags: string[] | null
  market_source: string | null
  resolution_source: string | null
  status: 'pending' | 'active' | 'resolved' | 'cancelled'
  start_date: string | null
  end_date: string | null
  trading_start: string | null
  trading_end: string | null
  resolved_at: string | null
  winning_outcome: string | null
  is_v4_parent: boolean
  v4_parent_market_id: string | null
  creator_address: string | null
  is_sponsored: boolean
  is_gas_sponsored: boolean
  gas_sponsor_address: string | null
  initial_price: number
  total_volume: number
  total_liquidity: number
  total_trades: number
  unique_traders: number
  options: string[] | null
  option_pools: number[] | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface BlockchainContract {
  id: string
  version: string
  contract_type: 'amm' | 'helpers' | 'moi'
  module_names: string[]
  account_address: string
  network: 'testnet' | 'mainnet' | 'movement-testnet'
  is_latest: boolean
  deployment_status: 'active' | 'disabled' | 'pending' | 'offchain'
  chain_status: 'onchain' | 'offchain'
  deployed_at: string | null
  created_at: string
  updated_at: string
}

export interface Trade {
  id: string
  market_id: string
  tx_hash: string | null
  tx_version: number | null
  trader_address: string
  trade_type: string
  option_index: number
  apt_amount: number
  tokens_out: number
  gas_sponsored: boolean
  gas_fee_paid: number | null
  price_impact_bps: number | null
  timestamp: string
  created_at: string
}

export interface UserPosition {
  id: string
  market_id: string
  user_address: string
  option_index: number
  token_balance: number
  avg_entry_price: number | null
  total_invested: number
  unrealized_pnl: number | null
  realized_pnl: number | null
  first_trade_at: string | null
  last_trade_at: string | null
  created_at: string
  updated_at: string
}

export interface Vote {
  id: string
  market_id: string
  user_address: string
  vote_type: 'up' | 'down'
  created_at: string
}

export interface GasStationConfig {
  id: string
  fee_payer_address: string
  default_daily_limit_per_user: number
  max_gas_per_transaction: number
  enabled: boolean
  whitelist_only: boolean
  created_at: string
  updated_at: string
}

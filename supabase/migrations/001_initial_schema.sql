-- =====================================================
-- APZION MVP - Initial Database Schema
-- Migration: 001
-- Created: 2025-11-25
-- Description: Core tables for markets, trades, and contract versioning
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: blockchain_contracts
-- Purpose: Dynamic contract version management (NO hardcoded addresses!)
-- =====================================================
CREATE TABLE blockchain_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Contract Identification
  version TEXT NOT NULL,                    -- 'v3-binary-safe', 'v3-multi-safe', 'sponsored-v2'
  contract_type TEXT NOT NULL,              -- 'amm', 'helpers', 'sponsored'
  module_names TEXT[] NOT NULL,             -- ['v3AMMbinary'], ['v3AMMmulti'], ['sponsored_markets_v2']

  -- Deployment Info
  account_address TEXT NOT NULL,            -- Contract deployment address (0x...)
  network TEXT NOT NULL DEFAULT 'testnet',  -- 'testnet', 'mainnet', 'movement-testnet'

  -- Status
  is_latest BOOLEAN DEFAULT false,          -- TRUE = currently active version
  deployment_status TEXT DEFAULT 'active',  -- 'active', 'disabled', 'pending', 'offchain'
  chain_status TEXT DEFAULT 'onchain',      -- 'onchain', 'offchain'

  -- Metadata
  deployed_at TIMESTAMPTZ DEFAULT now(),
  deployed_by TEXT,                         -- Deployer address
  notes TEXT,                               -- Deployment notes

  -- Constraints
  UNIQUE(version, network),
  CHECK (network IN ('testnet', 'mainnet', 'movement-testnet')),
  CHECK (contract_type IN ('amm', 'helpers', 'sponsored')),
  CHECK (deployment_status IN ('active', 'disabled', 'pending', 'offchain')),
  CHECK (chain_status IN ('onchain', 'offchain'))
);

-- Index for fast lookup of latest contracts
CREATE INDEX idx_blockchain_contracts_latest
  ON blockchain_contracts(contract_type, network, is_latest)
  WHERE is_latest = true;

-- =====================================================
-- TABLE: markets
-- Purpose: All market types (binary, multi, sponsored)
-- =====================================================
CREATE TABLE markets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- On-chain Reference
  market_object_address TEXT UNIQUE,        -- On-chain address (NULL if pending deployment)

  -- Market Classification
  marketplace_version TEXT,                 -- 'v3', 'v4'
  market_system TEXT,                       -- 'v3-binary', 'v3-multi', 'sponsored-v2'
  market_type TEXT,                         -- 'binary', 'multi_option'
  market_source TEXT,                       -- 'manual', 'switchboard', 'polymarket', 'sponsored', 'event'
  resolution_source TEXT,                   -- 'manual', 'switchboard', 'polymarket_api', 'football-data-org'

  -- Market Content
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  category TEXT,                            -- 'sports', 'crypto', 'politics', 'entertainment'

  -- Options (for multi-option markets)
  options TEXT[],                           -- ['Option A', 'Option B', ...] or ['YES', 'NO']
  option_pools BIGINT[],                    -- [pool_a, pool_b, ...] - token reserves in octas (1e-8 APT)

  -- Trading Parameters
  trading_start TIMESTAMPTZ,
  trading_end TIMESTAMPTZ,
  min_bet BIGINT DEFAULT 1000000,           -- 0.01 APT (in octas)

  -- Resolution
  status TEXT DEFAULT 'pending',            -- 'pending', 'active', 'resolved', 'cancelled'
  resolved BOOLEAN DEFAULT false,
  winning_outcome SMALLINT,                 -- 0=YES/Option 0, 1=NO/Option 1, etc.
  resolution_evidence_hash TEXT,            -- IPFS/Arweave hash for proof
  early_resolution BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,

  -- Sponsored Market Fields
  sponsor_address TEXT,
  sponsor_name TEXT,
  sponsor_amount BIGINT,                    -- Initial prize pool contribution (in octas)
  approval_status TEXT,                     -- 'pending', 'approved', 'rejected' (for sponsored markets)
  rejection_reason TEXT,

  -- Gas Sponsorship (NEW!)
  is_gas_sponsored BOOLEAN DEFAULT false,   -- TRUE = Users pay ZERO gas
  gas_sponsor_address TEXT,                 -- Fee payer address (Geomid)

  -- V4 MOI Fields (parent-child relationship)
  is_v4_parent BOOLEAN DEFAULT false,
  v4_parent_market_id UUID REFERENCES markets(id),

  -- Administration
  admin_address TEXT,
  creator_address TEXT,

  -- Stats
  total_volume BIGINT DEFAULT 0,            -- Total APT traded (in octas)
  total_trades INT DEFAULT 0,               -- Number of trades
  unique_traders INT DEFAULT 0,             -- Unique participants

  -- Oracle Integration
  oracle_job_id TEXT,                       -- Switchboard job ID (for auto-resolution)
  polymarket_clob_token_id TEXT,            -- Polymarket CLOB token ID

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CHECK (status IN ('pending', 'active', 'resolved', 'cancelled')),
  CHECK (market_type IN ('binary', 'multi_option')),
  CHECK (marketplace_version IN ('v3', 'v4')),
  CHECK (approval_status IN ('pending', 'approved', 'rejected'))
);

-- Indexes for common queries
CREATE INDEX idx_markets_status ON markets(status);
CREATE INDEX idx_markets_category ON markets(category);
CREATE INDEX idx_markets_trading_end ON markets(trading_end);
CREATE INDEX idx_markets_gas_sponsored ON markets(is_gas_sponsored) WHERE is_gas_sponsored = true;
CREATE INDEX idx_markets_creator ON markets(creator_address);
CREATE INDEX idx_markets_parent ON markets(v4_parent_market_id) WHERE v4_parent_market_id IS NOT NULL;

-- =====================================================
-- TABLE: trades
-- Purpose: Record all buy/swap/sell transactions
-- =====================================================
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- References
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,

  -- Transaction Details
  tx_hash TEXT NOT NULL,                    -- On-chain transaction hash
  tx_version BIGINT NOT NULL,               -- Aptos transaction version (for ordering)

  -- Trade Info
  trader_address TEXT NOT NULL,
  trade_type TEXT NOT NULL,                 -- 'buy_yes', 'buy_no', 'buy_option', 'swap', 'remove_liquidity'
  option_index SMALLINT,                    -- For multi-option markets

  -- Buy/Sell Amounts
  apt_amount BIGINT,                        -- APT deposited (in octas)
  tokens_out BIGINT,                        -- Tokens received (in smallest unit)

  -- Swap-specific (for swap transactions)
  from_option_index SMALLINT,
  to_option_index SMALLINT,
  amount_in BIGINT,
  amount_out BIGINT,

  -- Gas Sponsorship (NEW!)
  gas_sponsored BOOLEAN DEFAULT false,      -- TRUE = This trade was gas-free for user
  gas_fee_paid BIGINT,                      -- Actual gas fee (paid by sponsor if gas_sponsored=true)

  -- Price Impact
  price_impact_bps SMALLINT,                -- Price impact in basis points (e.g., 50 = 0.5%)

  -- Metadata
  timestamp TIMESTAMPTZ DEFAULT now(),
  block_height BIGINT,

  -- Constraints
  CHECK (trade_type IN ('buy_yes', 'buy_no', 'buy_option', 'swap', 'remove_liquidity')),
  UNIQUE(tx_hash, trader_address)           -- Prevent duplicate recording
);

-- Indexes for analytics
CREATE INDEX idx_trades_market ON trades(market_id);
CREATE INDEX idx_trades_trader ON trades(trader_address);
CREATE INDEX idx_trades_timestamp ON trades(timestamp DESC);
CREATE INDEX idx_trades_tx_version ON trades(tx_version DESC);
CREATE INDEX idx_trades_gas_sponsored ON trades(gas_sponsored) WHERE gas_sponsored = true;

-- =====================================================
-- TABLE: redemptions
-- Purpose: Track winner payouts
-- =====================================================
CREATE TABLE redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- References
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,

  -- Transaction
  tx_hash TEXT NOT NULL,
  tx_version BIGINT NOT NULL,

  -- Redemption Details
  tokens_burned BIGINT NOT NULL,            -- Winning tokens burned
  reward_received BIGINT NOT NULL,          -- APT received (in octas)

  -- Metadata
  redeemed_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  UNIQUE(market_id, user_address)           -- One redemption per user per market
);

CREATE INDEX idx_redemptions_market ON redemptions(market_id);
CREATE INDEX idx_redemptions_user ON redemptions(user_address);

-- =====================================================
-- TABLE: user_positions
-- Purpose: Cache user holdings (for fast portfolio queries)
-- =====================================================
CREATE TABLE user_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- References
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,

  -- Position Details
  option_index SMALLINT NOT NULL,           -- 0=YES/Option A, 1=NO/Option B, etc.
  token_balance BIGINT NOT NULL DEFAULT 0,  -- Current token holdings
  avg_entry_price NUMERIC(20, 8),           -- Average price paid per token
  total_invested BIGINT DEFAULT 0,          -- Total APT invested (in octas)

  -- Stats
  unrealized_pnl BIGINT,                    -- Current P&L (if market active)
  realized_pnl BIGINT,                      -- Realized P&L (if redeemed)

  -- Metadata
  first_trade_at TIMESTAMPTZ,
  last_trade_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  UNIQUE(market_id, user_address, option_index)
);

CREATE INDEX idx_positions_user ON user_positions(user_address);
CREATE INDEX idx_positions_market ON user_positions(market_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Update market stats on trade insert
CREATE OR REPLACE FUNCTION update_market_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE markets
  SET
    total_volume = total_volume + COALESCE(NEW.apt_amount, 0),
    total_trades = total_trades + 1,
    updated_at = now()
  WHERE id = NEW.market_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_market_stats
AFTER INSERT ON trades
FOR EACH ROW
EXECUTE FUNCTION update_market_stats();

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_markets_updated_at
BEFORE UPDATE ON markets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED DATA: Contract Versions
-- =====================================================

-- NOTE: Update account_address with your deployed contract addresses!

INSERT INTO blockchain_contracts (version, contract_type, module_names, account_address, network, is_latest, deployment_status)
VALUES
  ('v3-binary-safe', 'amm', ARRAY['v3AMMbinary'], '0xYOUR_V3_BINARY_ADDRESS', 'testnet', true, 'active'),
  ('v3-multi-safe', 'amm', ARRAY['v3AMMmulti'], '0xYOUR_V3_MULTI_ADDRESS', 'testnet', true, 'active'),
  ('sponsored-v2', 'sponsored', ARRAY['sponsored_markets_v2'], '0xYOUR_SPONSORED_ADDRESS', 'testnet', true, 'active'),
  ('helpers', 'helpers', ARRAY['token_naming'], '0xYOUR_HELPERS_ADDRESS', 'testnet', true, 'active')
ON CONFLICT (version, network) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE blockchain_contracts IS 'Dynamic contract version management - NO hardcoded addresses in code!';
COMMENT ON TABLE markets IS 'All market types: v3-binary, v3-multi, sponsored-v2';
COMMENT ON TABLE trades IS 'All on-chain trading activity (buy, swap, LP operations)';
COMMENT ON TABLE redemptions IS 'Winner payouts after market resolution';
COMMENT ON TABLE user_positions IS 'Cached user holdings for fast portfolio queries';

COMMENT ON COLUMN markets.is_gas_sponsored IS 'TRUE = Users pay ZERO gas (fee payer covers)';
COMMENT ON COLUMN trades.gas_sponsored IS 'TRUE = This specific trade was gas-free for user';

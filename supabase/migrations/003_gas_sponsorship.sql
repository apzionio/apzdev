-- =====================================================
-- APZION MVP - Gas Sponsorship System
-- Migration: 003
-- Created: 2025-11-25
-- Description: Gas station quota tracking and fee payer management
-- =====================================================

-- =====================================================
-- TABLE: gas_sponsorship_usage
-- Purpose: Record every gas-sponsored transaction
-- =====================================================
CREATE TABLE gas_sponsorship_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- References
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,

  -- Transaction Details
  tx_hash TEXT NOT NULL UNIQUE,
  tx_version BIGINT NOT NULL,

  -- Gas Costs
  gas_used BIGINT NOT NULL,                 -- Gas units consumed
  gas_unit_price BIGINT NOT NULL,           -- Price per gas unit (in octas)
  total_gas_fee BIGINT NOT NULL,            -- gas_used * gas_unit_price

  -- Fee Payer
  fee_payer_address TEXT NOT NULL,          -- Who paid the gas (Geomid address)

  -- Metadata
  sponsored_at TIMESTAMPTZ DEFAULT now(),
  block_height BIGINT
);

CREATE INDEX idx_gas_usage_user ON gas_sponsorship_usage(user_address);
CREATE INDEX idx_gas_usage_market ON gas_sponsorship_usage(market_id);
CREATE INDEX idx_gas_usage_date ON gas_sponsorship_usage(sponsored_at);
CREATE INDEX idx_gas_usage_fee_payer ON gas_sponsorship_usage(fee_payer_address);

-- =====================================================
-- TABLE: user_daily_quotas
-- Purpose: Cache daily gas usage per user (for fast quota checks)
-- =====================================================
CREATE TABLE user_daily_quotas (
  user_address TEXT NOT NULL,
  date DATE NOT NULL,

  -- Quota Tracking
  gas_used_today BIGINT DEFAULT 0,          -- Total gas used today (in octas)
  remaining_quota BIGINT,                   -- Calculated field
  transactions_today INT DEFAULT 0,         -- Number of sponsored txs today

  -- Limits (can override per-user)
  daily_limit BIGINT,                       -- NULL = use global default
  max_transactions_per_day INT,             -- NULL = unlimited

  -- Metadata
  first_transaction_at TIMESTAMPTZ,
  last_transaction_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  PRIMARY KEY (user_address, date)
);

CREATE INDEX idx_quotas_date ON user_daily_quotas(date);
CREATE INDEX idx_quotas_user ON user_daily_quotas(user_address);
CREATE INDEX idx_quotas_exceeded ON user_daily_quotas(user_address, date)
  WHERE gas_used_today >= daily_limit;

-- =====================================================
-- TABLE: gas_station_config
-- Purpose: Global gas sponsorship configuration
-- =====================================================
CREATE TABLE gas_station_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Fee Payer Settings
  fee_payer_address TEXT NOT NULL,          -- Geomid address
  fee_payer_balance BIGINT,                 -- Current APT balance (in octas) - cached
  min_balance_alert BIGINT DEFAULT 100000000000,  -- Alert if < 1000 APT

  -- Global Limits
  default_daily_limit_per_user BIGINT DEFAULT 5000000000,  -- 50 APT per user per day
  max_gas_per_transaction BIGINT DEFAULT 100000000,        -- 1 APT max per tx
  max_transactions_per_user_per_day INT DEFAULT 50,        -- 50 tx/day per user

  -- Whitelist Mode
  whitelist_enabled BOOLEAN DEFAULT false,  -- If true, only whitelisted users can use
  market_whitelist_enabled BOOLEAN DEFAULT true,  -- If true, only whitelisted markets

  -- Rate Limiting
  rate_limit_per_ip INT DEFAULT 10,         -- Max requests per minute per IP
  rate_limit_window_seconds INT DEFAULT 60,

  -- Status
  enabled BOOLEAN DEFAULT true,             -- Global kill switch
  emergency_stop BOOLEAN DEFAULT false,     -- Emergency disable (security)

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default config
INSERT INTO gas_station_config (
  fee_payer_address,
  default_daily_limit_per_user,
  max_gas_per_transaction,
  enabled
)
VALUES (
  '0xGEOMID_FEE_PAYER_ADDRESS',  -- REPLACE with your Geomid address
  5000000000,                     -- 50 APT daily limit
  100000000,                      -- 1 APT per tx limit
  true
)
ON CONFLICT DO NOTHING;

-- =====================================================
-- TABLE: gas_station_whitelist
-- Purpose: Whitelisted users for gas sponsorship
-- =====================================================
CREATE TABLE gas_station_whitelist (
  user_address TEXT PRIMARY KEY,

  -- Whitelist Details
  reason TEXT,                              -- Why whitelisted (e.g., 'VIP', 'partner')
  custom_daily_limit BIGINT,                -- Override global limit

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  added_by TEXT,                            -- Admin who added
  added_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ                    -- NULL = never expires
);

CREATE INDEX idx_whitelist_active ON gas_station_whitelist(is_active) WHERE is_active = true;

-- =====================================================
-- TABLE: gas_station_blocked_users
-- Purpose: Blocked users (abuse prevention)
-- =====================================================
CREATE TABLE gas_station_blocked_users (
  user_address TEXT PRIMARY KEY,

  -- Block Details
  reason TEXT NOT NULL,                     -- Why blocked (e.g., 'abuse', 'bot')
  blocked_until TIMESTAMPTZ,                -- NULL = permanent ban

  -- Metadata
  blocked_by TEXT,                          -- Admin who blocked
  blocked_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- VIEWS
-- =====================================================

-- Gas usage analytics by user
CREATE OR REPLACE VIEW gas_usage_by_user AS
SELECT
  user_address,
  COUNT(*) AS total_sponsored_txs,
  SUM(total_gas_fee) / 1e8 AS total_gas_apt,  -- Convert octas to APT
  MIN(sponsored_at) AS first_sponsored_tx,
  MAX(sponsored_at) AS last_sponsored_tx
FROM gas_sponsorship_usage
GROUP BY user_address
ORDER BY total_gas_apt DESC;

-- Gas usage analytics by market
CREATE OR REPLACE VIEW gas_usage_by_market AS
SELECT
  m.id,
  m.title,
  m.market_object_address,
  COUNT(g.id) AS sponsored_txs,
  SUM(g.total_gas_fee) / 1e8 AS total_gas_apt,
  COUNT(DISTINCT g.user_address) AS unique_users_sponsored
FROM markets m
LEFT JOIN gas_sponsorship_usage g ON m.id = g.market_id
WHERE m.is_gas_sponsored = true
GROUP BY m.id, m.title, m.market_object_address
ORDER BY total_gas_apt DESC;

-- Daily gas spending report
CREATE OR REPLACE VIEW daily_gas_spending AS
SELECT
  DATE(sponsored_at) AS date,
  COUNT(*) AS sponsored_txs,
  SUM(total_gas_fee) / 1e8 AS total_gas_apt,
  COUNT(DISTINCT user_address) AS unique_users,
  COUNT(DISTINCT market_id) AS unique_markets
FROM gas_sponsorship_usage
GROUP BY DATE(sponsored_at)
ORDER BY date DESC;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Check if user has remaining quota (called by API before sponsoring)
CREATE OR REPLACE FUNCTION check_user_gas_quota(
  p_user_address TEXT,
  p_estimated_gas BIGINT DEFAULT 100000000  -- Default 1 APT
)
RETURNS TABLE(
  has_quota BOOLEAN,
  gas_used_today BIGINT,
  remaining_quota BIGINT,
  daily_limit BIGINT,
  reason TEXT
) AS $$
DECLARE
  v_config RECORD;
  v_quota RECORD;
  v_is_blocked BOOLEAN;
  v_is_whitelisted BOOLEAN;
  v_custom_limit BIGINT;
BEGIN
  -- Get global config
  SELECT * INTO v_config FROM gas_station_config LIMIT 1;

  -- Check if gas station is enabled
  IF NOT v_config.enabled OR v_config.emergency_stop THEN
    RETURN QUERY SELECT false, 0::BIGINT, 0::BIGINT, 0::BIGINT, 'Gas station disabled'::TEXT;
    RETURN;
  END IF;

  -- Check if user is blocked
  SELECT EXISTS(
    SELECT 1 FROM gas_station_blocked_users
    WHERE user_address = p_user_address
      AND (blocked_until IS NULL OR blocked_until > now())
  ) INTO v_is_blocked;

  IF v_is_blocked THEN
    RETURN QUERY SELECT false, 0::BIGINT, 0::BIGINT, 0::BIGINT, 'User blocked'::TEXT;
    RETURN;
  END IF;

  -- Check whitelist (if enabled)
  IF v_config.whitelist_enabled THEN
    SELECT
      EXISTS(SELECT 1 FROM gas_station_whitelist WHERE user_address = p_user_address AND is_active = true),
      custom_daily_limit
    INTO v_is_whitelisted, v_custom_limit
    FROM gas_station_whitelist
    WHERE user_address = p_user_address AND is_active = true;

    IF NOT v_is_whitelisted THEN
      RETURN QUERY SELECT false, 0::BIGINT, 0::BIGINT, 0::BIGINT, 'User not whitelisted'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Get or create today's quota
  SELECT * INTO v_quota
  FROM user_daily_quotas
  WHERE user_address = p_user_address
    AND date = CURRENT_DATE;

  IF NOT FOUND THEN
    -- First transaction today
    v_quota.gas_used_today := 0;
    v_quota.daily_limit := COALESCE(v_custom_limit, v_config.default_daily_limit_per_user);
  ELSE
    v_quota.daily_limit := COALESCE(v_quota.daily_limit, v_custom_limit, v_config.default_daily_limit_per_user);
  END IF;

  -- Check quota
  IF v_quota.gas_used_today + p_estimated_gas > v_quota.daily_limit THEN
    RETURN QUERY SELECT
      false,
      v_quota.gas_used_today,
      v_quota.daily_limit - v_quota.gas_used_today,
      v_quota.daily_limit,
      'Daily quota exceeded'::TEXT;
    RETURN;
  END IF;

  -- Check per-tx limit
  IF p_estimated_gas > v_config.max_gas_per_transaction THEN
    RETURN QUERY SELECT
      false,
      v_quota.gas_used_today,
      v_quota.daily_limit - v_quota.gas_used_today,
      v_quota.daily_limit,
      'Gas per transaction limit exceeded'::TEXT;
    RETURN;
  END IF;

  -- All checks passed
  RETURN QUERY SELECT
    true,
    v_quota.gas_used_today,
    v_quota.daily_limit - v_quota.gas_used_today,
    v_quota.daily_limit,
    'OK'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Record gas usage (called after transaction confirmed)
CREATE OR REPLACE FUNCTION record_gas_usage(
  p_user_address TEXT,
  p_market_id UUID,
  p_tx_hash TEXT,
  p_tx_version BIGINT,
  p_gas_used BIGINT,
  p_gas_unit_price BIGINT,
  p_fee_payer_address TEXT
)
RETURNS void AS $$
DECLARE
  v_total_gas_fee BIGINT;
BEGIN
  v_total_gas_fee := p_gas_used * p_gas_unit_price;

  -- Insert into gas_sponsorship_usage
  INSERT INTO gas_sponsorship_usage (
    market_id,
    user_address,
    tx_hash,
    tx_version,
    gas_used,
    gas_unit_price,
    total_gas_fee,
    fee_payer_address
  )
  VALUES (
    p_market_id,
    p_user_address,
    p_tx_hash,
    p_tx_version,
    p_gas_used,
    p_gas_unit_price,
    v_total_gas_fee,
    p_fee_payer_address
  );

  -- Update or create daily quota
  INSERT INTO user_daily_quotas (
    user_address,
    date,
    gas_used_today,
    transactions_today,
    first_transaction_at,
    last_transaction_at
  )
  VALUES (
    p_user_address,
    CURRENT_DATE,
    v_total_gas_fee,
    1,
    now(),
    now()
  )
  ON CONFLICT (user_address, date) DO UPDATE
  SET
    gas_used_today = user_daily_quotas.gas_used_today + v_total_gas_fee,
    transactions_today = user_daily_quotas.transactions_today + 1,
    last_transaction_at = now(),
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- Cleanup old quota records (run daily via cron)
CREATE OR REPLACE FUNCTION cleanup_old_quotas()
RETURNS void AS $$
BEGIN
  DELETE FROM user_daily_quotas
  WHERE date < CURRENT_DATE - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE gas_sponsorship_usage IS 'Record every gas-sponsored transaction for analytics';
COMMENT ON TABLE user_daily_quotas IS 'Cache daily gas usage per user for fast quota checks';
COMMENT ON TABLE gas_station_config IS 'Global gas sponsorship configuration (fee payer, limits, etc.)';
COMMENT ON TABLE gas_station_whitelist IS 'VIP users with custom gas quotas';
COMMENT ON TABLE gas_station_blocked_users IS 'Blocked users (abuse prevention)';

COMMENT ON FUNCTION check_user_gas_quota IS 'Check if user has remaining quota before sponsoring transaction';
COMMENT ON FUNCTION record_gas_usage IS 'Record gas usage after transaction confirmed on-chain';
COMMENT ON FUNCTION cleanup_old_quotas IS 'Cleanup old quota records (run daily via cron)';

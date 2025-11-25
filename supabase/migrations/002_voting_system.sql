-- =====================================================
-- APZION MVP - Voting System
-- Migration: 002
-- Created: 2025-11-25
-- Description: Market voting and social sharing features
-- =====================================================

-- =====================================================
-- TABLE: votes
-- Purpose: Market quality voting (upvote/downvote)
-- =====================================================
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- References
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  voter_address TEXT NOT NULL,

  -- Vote Details
  vote_direction BOOLEAN NOT NULL,          -- TRUE = upvote, FALSE = downvote
  vote_weight BIGINT DEFAULT 1,             -- Future: Can be token-weighted

  -- On-chain Reference (if voting is on-chain)
  tx_hash TEXT,
  tx_version BIGINT,

  -- Metadata
  voted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  UNIQUE(market_id, voter_address)          -- One vote per user per market
);

CREATE INDEX idx_votes_market ON votes(market_id);
CREATE INDEX idx_votes_voter ON votes(voter_address);
CREATE INDEX idx_votes_direction ON votes(vote_direction);

-- =====================================================
-- TABLE: social_shares
-- Purpose: Track social media sharing for analytics
-- =====================================================
CREATE TABLE social_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- References
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  shared_by TEXT NOT NULL,                  -- User wallet address

  -- Share Details
  platform TEXT NOT NULL,                   -- 'twitter', 'telegram', 'discord'
  share_url TEXT,                           -- Generated share URL

  -- Analytics
  click_count INT DEFAULT 0,                -- If we track clicks
  conversion_count INT DEFAULT 0,           -- If we track conversions (new users)

  -- Metadata
  shared_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CHECK (platform IN ('twitter', 'telegram', 'discord', 'copy_link'))
);

CREATE INDEX idx_shares_market ON social_shares(market_id);
CREATE INDEX idx_shares_platform ON social_shares(platform);
CREATE INDEX idx_shares_user ON social_shares(shared_by);

-- =====================================================
-- TABLE: leaderboard
-- Purpose: Track top traders and their stats
-- =====================================================
CREATE TABLE leaderboard (
  user_address TEXT PRIMARY KEY,

  -- Trading Stats
  total_trades INT DEFAULT 0,
  total_volume BIGINT DEFAULT 0,            -- Total APT traded (in octas)

  -- P&L Stats
  total_won BIGINT DEFAULT 0,               -- Total APT won (in octas)
  total_lost BIGINT DEFAULT 0,              -- Total APT lost (in octas)
  net_profit BIGINT DEFAULT 0,              -- total_won - total_lost

  -- Win Rate
  markets_won INT DEFAULT 0,
  markets_lost INT DEFAULT 0,
  win_rate NUMERIC(5,2),                    -- Percentage (e.g., 67.50)

  -- Rankings
  rank INT,                                 -- Overall rank by net profit
  rank_volume INT,                          -- Rank by volume
  rank_win_rate INT,                        -- Rank by win rate

  -- Badges (future: NFT achievements)
  badges JSONB DEFAULT '[]'::jsonb,         -- ['early_adopter', 'whale', ...]

  -- Social
  display_name TEXT,                        -- Optional username
  avatar_url TEXT,                          -- Optional avatar

  -- Metadata
  first_trade_at TIMESTAMPTZ,
  last_trade_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_leaderboard_rank ON leaderboard(rank) WHERE rank IS NOT NULL;
CREATE INDEX idx_leaderboard_net_profit ON leaderboard(net_profit DESC);
CREATE INDEX idx_leaderboard_volume ON leaderboard(total_volume DESC);
CREATE INDEX idx_leaderboard_win_rate ON leaderboard(win_rate DESC);

-- =====================================================
-- TABLE: market_comments (OPTIONAL - Future Feature)
-- Purpose: Discussion threads on markets
-- =====================================================
CREATE TABLE market_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- References
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES market_comments(id),  -- For nested replies

  -- Comment Details
  author_address TEXT NOT NULL,
  content TEXT NOT NULL,

  -- Moderation
  is_deleted BOOLEAN DEFAULT false,
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,

  -- Engagement
  upvotes INT DEFAULT 0,
  downvotes INT DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  edited_at TIMESTAMPTZ,

  -- Constraints
  CHECK (length(content) <= 1000)           -- Max 1000 chars
);

CREATE INDEX idx_comments_market ON market_comments(market_id);
CREATE INDEX idx_comments_author ON market_comments(author_address);
CREATE INDEX idx_comments_parent ON market_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;

-- =====================================================
-- VIEWS
-- =====================================================

-- Market vote summary
CREATE OR REPLACE VIEW market_vote_summary AS
SELECT
  market_id,
  COUNT(*) AS total_votes,
  SUM(CASE WHEN vote_direction = true THEN 1 ELSE 0 END) AS upvotes,
  SUM(CASE WHEN vote_direction = false THEN 1 ELSE 0 END) AS downvotes,
  ROUND(
    100.0 * SUM(CASE WHEN vote_direction = true THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) AS upvote_percentage
FROM votes
GROUP BY market_id;

-- Top traders leaderboard view
CREATE OR REPLACE VIEW leaderboard_top_100 AS
SELECT
  user_address,
  total_trades,
  total_volume / 1e8 AS total_volume_apt,  -- Convert octas to APT
  net_profit / 1e8 AS net_profit_apt,
  win_rate,
  rank,
  display_name,
  avatar_url
FROM leaderboard
ORDER BY net_profit DESC
LIMIT 100;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Update vote counts when vote changes
CREATE OR REPLACE FUNCTION update_vote_on_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.vote_direction != NEW.vote_direction THEN
    -- Vote direction changed, update timestamp
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_vote_updated
BEFORE UPDATE ON votes
FOR EACH ROW
EXECUTE FUNCTION update_vote_on_change();

-- Update leaderboard on trade completion
CREATE OR REPLACE FUNCTION update_leaderboard_on_trade()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO leaderboard (user_address, total_trades, total_volume, first_trade_at, last_trade_at)
  VALUES (
    NEW.trader_address,
    1,
    COALESCE(NEW.apt_amount, 0),
    NEW.timestamp,
    NEW.timestamp
  )
  ON CONFLICT (user_address) DO UPDATE
  SET
    total_trades = leaderboard.total_trades + 1,
    total_volume = leaderboard.total_volume + COALESCE(NEW.apt_amount, 0),
    last_trade_at = NEW.timestamp,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leaderboard_trade
AFTER INSERT ON trades
FOR EACH ROW
EXECUTE FUNCTION update_leaderboard_on_trade();

-- Update leaderboard on redemption (winner payout)
CREATE OR REPLACE FUNCTION update_leaderboard_on_redemption()
RETURNS TRIGGER AS $$
DECLARE
  v_invested BIGINT;
  v_profit BIGINT;
BEGIN
  -- Get user's total investment in this market
  SELECT COALESCE(SUM(apt_amount), 0)
  INTO v_invested
  FROM trades
  WHERE market_id = NEW.market_id
    AND trader_address = NEW.user_address;

  -- Calculate profit
  v_profit := NEW.reward_received - v_invested;

  -- Update leaderboard
  UPDATE leaderboard
  SET
    total_won = total_won + NEW.reward_received,
    net_profit = net_profit + v_profit,
    markets_won = CASE WHEN v_profit > 0 THEN markets_won + 1 ELSE markets_won END,
    markets_lost = CASE WHEN v_profit <= 0 THEN markets_lost + 1 ELSE markets_lost END,
    win_rate = CASE
      WHEN markets_won + markets_lost > 0
      THEN ROUND(100.0 * markets_won / (markets_won + markets_lost), 2)
      ELSE 0
    END,
    updated_at = now()
  WHERE user_address = NEW.user_address;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leaderboard_redemption
AFTER INSERT ON redemptions
FOR EACH ROW
EXECUTE FUNCTION update_leaderboard_on_redemption();

-- Refresh leaderboard ranks (call periodically via cron)
CREATE OR REPLACE FUNCTION refresh_leaderboard_ranks()
RETURNS void AS $$
BEGIN
  -- Rank by net profit
  WITH ranked AS (
    SELECT
      user_address,
      ROW_NUMBER() OVER (ORDER BY net_profit DESC) AS new_rank
    FROM leaderboard
  )
  UPDATE leaderboard l
  SET rank = r.new_rank
  FROM ranked r
  WHERE l.user_address = r.user_address;

  -- Rank by volume
  WITH ranked_volume AS (
    SELECT
      user_address,
      ROW_NUMBER() OVER (ORDER BY total_volume DESC) AS new_rank_volume
    FROM leaderboard
  )
  UPDATE leaderboard l
  SET rank_volume = r.new_rank_volume
  FROM ranked_volume r
  WHERE l.user_address = r.user_address;

  -- Rank by win rate (min 10 trades)
  WITH ranked_wr AS (
    SELECT
      user_address,
      ROW_NUMBER() OVER (ORDER BY win_rate DESC) AS new_rank_wr
    FROM leaderboard
    WHERE total_trades >= 10
  )
  UPDATE leaderboard l
  SET rank_win_rate = r.new_rank_wr
  FROM ranked_wr r
  WHERE l.user_address = r.user_address;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE votes IS 'Market quality voting - upvote/downvote for community curation';
COMMENT ON TABLE social_shares IS 'Track social media sharing for viral growth analytics';
COMMENT ON TABLE leaderboard IS 'Top traders ranked by profit, volume, and win rate';
COMMENT ON TABLE market_comments IS '(OPTIONAL) Discussion threads on markets - future feature';

COMMENT ON VIEW market_vote_summary IS 'Aggregated vote counts per market';
COMMENT ON VIEW leaderboard_top_100 IS 'Top 100 traders by net profit';

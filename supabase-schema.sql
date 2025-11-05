-- Supabase Database Schema for TrueData Cache
-- Run this SQL in your Supabase SQL Editor to create the necessary tables

-- Table for caching FNO market data
CREATE TABLE IF NOT EXISTS fno_market_cache (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for caching LTP (Last Traded Price) data
CREATE TABLE IF NOT EXISTS ltp_cache (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for caching bar/historical data
CREATE TABLE IF NOT EXISTS bars_cache (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for caching option chain data
CREATE TABLE IF NOT EXISTS option_chain_cache (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_fno_market_cache_key ON fno_market_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_fno_market_cache_expires ON fno_market_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_ltp_cache_key ON ltp_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_ltp_cache_expires ON ltp_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_bars_cache_key ON bars_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_bars_cache_expires ON bars_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_option_chain_cache_key ON option_chain_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_option_chain_cache_expires ON option_chain_cache(expires_at);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_fno_market_cache_updated_at
  BEFORE UPDATE ON fno_market_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ltp_cache_updated_at
  BEFORE UPDATE ON ltp_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bars_cache_updated_at
  BEFORE UPDATE ON bars_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_option_chain_cache_updated_at
  BEFORE UPDATE ON option_chain_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) - Allow all operations for service role
-- Adjust these policies based on your security requirements
ALTER TABLE fno_market_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE ltp_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE bars_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_chain_cache ENABLE ROW LEVEL SECURITY;

-- Policy to allow service role full access
CREATE POLICY "Service role can manage fno_market_cache"
  ON fno_market_cache FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage ltp_cache"
  ON ltp_cache FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage bars_cache"
  ON bars_cache FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage option_chain_cache"
  ON option_chain_cache FOR ALL
  USING (auth.role() = 'service_role');

-- Optional: Create a function to clean up expired entries (can be called via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM fno_market_cache WHERE expires_at < NOW();
  DELETE FROM ltp_cache WHERE expires_at < NOW();
  DELETE FROM bars_cache WHERE expires_at < NOW();
  DELETE FROM option_chain_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;


CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token TEXT,
  verification_expires_at TIMESTAMPTZ,
  google_id TEXT UNIQUE,
  avatar_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  role TEXT NOT NULL DEFAULT 'user',
  plan_message_limit INTEGER NOT NULL DEFAULT 20,
  plan_reset_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  billing_status TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS verification_token TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS plan_message_limit INTEGER NOT NULL DEFAULT 20;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS plan_reset_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS billing_status TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE app_users ALTER COLUMN external_id DROP NOT NULL;

UPDATE app_users
SET external_id = COALESCE(NULLIF(external_id, ''), email, id::text)
WHERE external_id IS NULL OR external_id = '';

ALTER TABLE app_users ALTER COLUMN external_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_app_users_email_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_app_users_email_unique
      ON app_users (LOWER(email))
      WHERE email IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_app_users_google_id_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_app_users_google_id_unique
      ON app_users (google_id)
      WHERE google_id IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_users_verification_token ON app_users (verification_token);

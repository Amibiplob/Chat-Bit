-- Persistent, atomic rate limits shared by every serverless instance.
CREATE TABLE auth_rate_limits (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_limits_expiration_idx ON auth_rate_limits(expires_at);

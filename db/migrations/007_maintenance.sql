-- Add an expiry index for bounded lease maintenance. Applied migrations stay intact.
CREATE INDEX realtime_activity_expiration_idx ON realtime_activity(expires_at);

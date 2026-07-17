CREATE INDEX CONCURRENTLY IF NOT EXISTS "ix_trade_analytics_events_session_created_id"
    ON "trade_analytics_events" ("session_id", "created_at", "id");

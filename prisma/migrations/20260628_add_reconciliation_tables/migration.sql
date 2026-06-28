CREATE TABLE IF NOT EXISTS "session_reconciliations" (
    "id" BIGSERIAL PRIMARY KEY,
    "session_id" VARCHAR(36) NOT NULL,
    "source_wallet" VARCHAR(255) NOT NULL,
    "source_scope" VARCHAR(20) NOT NULL,
    "unit" VARCHAR(10) NOT NULL,
    "our_pnl" DOUBLE PRECISION NOT NULL,
    "source_pnl" DOUBLE PRECISION NOT NULL,
    "pnl_gap" DOUBLE PRECISION NOT NULL,
    "our_return_pct" DOUBLE PRECISION,
    "source_return_pct" DOUBLE PRECISION,
    "pnl_gap_pct" DOUBLE PRECISION,
    "factors_json" TEXT,
    "series_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_reconciliations_session_id_fkey"
        FOREIGN KEY ("session_id") REFERENCES "strategy_sessions"("session_id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "session_reconciliations_session_id_idx"
    ON "session_reconciliations"("session_id");
CREATE INDEX IF NOT EXISTS "session_reconciliations_created_at_idx"
    ON "session_reconciliations"("created_at");

CREATE TABLE IF NOT EXISTS "reconciliation_positions" (
    "id" BIGSERIAL PRIMARY KEY,
    "reconciliation_id" BIGINT NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "condition_id" VARCHAR(100) NOT NULL,
    "market" VARCHAR(255) NOT NULL,
    "outcome" VARCHAR(50),
    "asset" VARCHAR(255),
    "target_shares" DOUBLE PRECISION,
    "target_dollars" DOUBLE PRECISION,
    "executed_shares" DOUBLE PRECISION,
    "fill_percent" DOUBLE PRECISION,
    "our_target_pct" DOUBLE PRECISION,
    "entry_lag_ms" DOUBLE PRECISION,
    "exit_lag_ms" DOUBLE PRECISION,
    "realized_pnl" DOUBLE PRECISION,
    "our_return_pct" DOUBLE PRECISION,
    "source_cash_pnl" DOUBLE PRECISION,
    "source_realized_pnl" DOUBLE PRECISION,
    "source_return_pct" DOUBLE PRECISION,
    "pnl_gap_pct" DOUBLE PRECISION,
    "source_wallet" VARCHAR(255),
    "source_seen_at" DOUBLE PRECISION,
    "source_position_size" DOUBLE PRECISION,
    "source_position_value" DOUBLE PRECISION,
    "source_avg_price" DOUBLE PRECISION,
    "our_held_before" DOUBLE PRECISION,
    "our_held_after" DOUBLE PRECISION,
    "our_fill_price" DOUBLE PRECISION,
    "our_fill_time" TIMESTAMP(3),
    "sizing_error_pct" DOUBLE PRECISION,
    "price_slippage" DOUBLE PRECISION,
    "source_entry_price" DOUBLE PRECISION,
    "our_entry_price" DOUBLE PRECISION,
    "source_exit_price" DOUBLE PRECISION,
    "our_exit_price" DOUBLE PRECISION,
    "our_current_shares" DOUBLE PRECISION,
    "source_current_shares" DOUBLE PRECISION,
    "verdict" VARCHAR(30) NOT NULL,
    "notes" TEXT,
    CONSTRAINT "reconciliation_positions_reconciliation_id_fkey"
        FOREIGN KEY ("reconciliation_id") REFERENCES "session_reconciliations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "reconciliation_positions_reconciliation_id_idx"
    ON "reconciliation_positions"("reconciliation_id");
CREATE INDEX IF NOT EXISTS "reconciliation_positions_condition_id_idx"
    ON "reconciliation_positions"("condition_id");
CREATE INDEX IF NOT EXISTS "reconciliation_positions_verdict_idx"
    ON "reconciliation_positions"("verdict");

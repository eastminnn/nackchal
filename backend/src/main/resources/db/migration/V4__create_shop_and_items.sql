CREATE TABLE item_catalog (
    code VARCHAR(32) PRIMARY KEY,
    name VARCHAR(40) NOT NULL,
    price_cash BIGINT NOT NULL CHECK (price_cash > 0),
    active BOOLEAN NOT NULL
);

-- SRS 6.2 초기값. 가격은 항상 이 표로 계산한다.
INSERT INTO item_catalog (code, name, price_cash, active) VALUES
    ('tomato', '토마토', 3, true),
    ('can', '깡통', 2, true);

CREATE TABLE inventories (
    user_id UUID NOT NULL REFERENCES users(id),
    item_code VARCHAR(32) NOT NULL REFERENCES item_catalog(code),
    quantity BIGINT NOT NULL CHECK (quantity >= 0),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (user_id, item_code)
);

CREATE TABLE shop_purchases (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    request_id UUID NOT NULL,
    item_code VARCHAR(32) NOT NULL REFERENCES item_catalog(code),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    unit_price_cash BIGINT NOT NULL CHECK (unit_price_cash > 0),
    total_cash BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT shop_purchases_request_key UNIQUE (user_id, request_id),
    CONSTRAINT shop_purchases_owner_key UNIQUE (id, user_id),
    CONSTRAINT shop_purchases_total_check CHECK (total_cash = unit_price_cash * quantity)
);

CREATE TABLE item_uses (
    id UUID PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES games(id),
    user_id UUID NOT NULL,
    target_user_id UUID NOT NULL,
    item_code VARCHAR(32) NOT NULL REFERENCES item_catalog(code),
    request_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT item_uses_request_key UNIQUE (user_id, request_id),
    CONSTRAINT item_uses_user_fkey FOREIGN KEY (game_id, user_id) REFERENCES game_participants(game_id, user_id),
    CONSTRAINT item_uses_target_fkey FOREIGN KEY (game_id, target_user_id)
        REFERENCES game_participants(game_id, user_id),
    CONSTRAINT item_uses_target_check CHECK (user_id <> target_user_id)
);

CREATE INDEX idx_item_uses_game ON item_uses(game_id);

-- 원장에 구매 차감을 허용한다. 보상은 게임 ID, 구매는 구매 ID에만 연결된다.
ALTER TABLE cash_transactions ALTER COLUMN game_id DROP NOT NULL;
ALTER TABLE cash_transactions ADD COLUMN purchase_id UUID;
ALTER TABLE cash_transactions DROP CONSTRAINT cash_transactions_amount_check;
ALTER TABLE cash_transactions DROP CONSTRAINT cash_transactions_reason_check;
ALTER TABLE cash_transactions ADD CONSTRAINT cash_transactions_reason_check CHECK (
    (reason = 'GAME_REWARD' AND amount > 0 AND game_id IS NOT NULL AND purchase_id IS NULL)
    OR (reason = 'PURCHASE' AND amount < 0 AND purchase_id IS NOT NULL AND game_id IS NULL)
);
ALTER TABLE cash_transactions ADD CONSTRAINT cash_transactions_purchase_fkey
    FOREIGN KEY (purchase_id, user_id) REFERENCES shop_purchases(id, user_id);
CREATE UNIQUE INDEX uq_cash_purchase ON cash_transactions(purchase_id) WHERE reason = 'PURCHASE';

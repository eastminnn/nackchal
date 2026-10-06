CREATE TABLE wallets (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    balance BIGINT NOT NULL CHECK (balance >= 0),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 기존 사용자도 잔액 0인 지갑을 갖는다. 가입 보상은 지급하지 않는다.
INSERT INTO wallets (user_id, balance, updated_at)
SELECT id, 0, now() FROM users;

CREATE TABLE games (
    id UUID PRIMARY KEY,
    room_code VARCHAR(6) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'ABORTED')),
    rules_version VARCHAR(40) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT games_ended_at_check CHECK (
        (status = 'RUNNING' AND ended_at IS NULL)
        OR (status <> 'RUNNING' AND ended_at IS NOT NULL AND ended_at >= started_at)
    )
);

CREATE INDEX idx_games_status_started_at ON games(status, started_at);

CREATE TABLE game_participants (
    game_id UUID NOT NULL REFERENCES games(id),
    user_id UUID NOT NULL REFERENCES users(id),
    seat_no INTEGER NOT NULL CHECK (seat_no >= 0),
    nickname_snapshot VARCHAR(12) NOT NULL,
    avatar_code_snapshot VARCHAR(32) NOT NULL,
    participation_status VARCHAR(16) NOT NULL
        CHECK (participation_status IN ('ACTIVE', 'FINISHED', 'LEFT', 'ABORTED')),
    final_balance BIGINT CHECK (final_balance >= 0),
    rank INTEGER CHECK (rank >= 1),
    reward_cash BIGINT CHECK (reward_cash >= 0),
    left_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (game_id, user_id),
    CONSTRAINT game_participants_seat_key UNIQUE (game_id, seat_no)
);

CREATE INDEX idx_game_participants_user_game ON game_participants(user_id, game_id);

CREATE TABLE round_results (
    game_id UUID NOT NULL REFERENCES games(id),
    round_no INTEGER NOT NULL CHECK (round_no BETWEEN 1 AND 10),
    lot_code VARCHAR(40) NOT NULL,
    lot_name_snapshot VARCHAR(100) NOT NULL,
    hint_grade VARCHAR(16) NOT NULL,
    revealed_grade VARCHAR(16) NOT NULL,
    actual_value BIGINT NOT NULL CHECK (actual_value >= 0),
    winner_user_id UUID,
    final_price BIGINT NOT NULL,
    revealed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (game_id, round_no),
    CONSTRAINT round_results_winner_fkey FOREIGN KEY (game_id, winner_user_id)
        REFERENCES game_participants(game_id, user_id),
    CONSTRAINT round_results_price_check CHECK (
        (winner_user_id IS NULL AND final_price = 0)
        OR (winner_user_id IS NOT NULL AND final_price >= 5)
    )
);

-- 캐시 변경 원장. 수정·삭제하지 않으며 지갑 잔액은 이 합계와 같다.
CREATE TABLE cash_transactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES wallets(user_id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    reason VARCHAR(24) NOT NULL CHECK (reason = 'GAME_REWARD'),
    game_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT cash_transactions_participant_fkey FOREIGN KEY (game_id, user_id)
        REFERENCES game_participants(game_id, user_id)
);

CREATE UNIQUE INDEX uq_cash_game_reward ON cash_transactions(game_id, user_id) WHERE reason = 'GAME_REWARD';
CREATE INDEX idx_cash_transactions_user_created ON cash_transactions(user_id, created_at, id);

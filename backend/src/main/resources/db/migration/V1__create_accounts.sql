CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    nickname VARCHAR(12) NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 12),
    avatar_code VARCHAR(32) NOT NULL DEFAULT 'plush-bear'
        CHECK (avatar_code IN ('plush-bear', 'plush-bunny', 'plush-cat', 'plush-dog')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE email_credentials (
    account_id UUID PRIMARY KEY REFERENCES accounts(id),
    email VARCHAR(254) NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
    password_hash VARCHAR(255) NOT NULL
);

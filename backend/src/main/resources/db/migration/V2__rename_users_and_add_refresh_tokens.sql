ALTER TABLE accounts RENAME TO users;
ALTER TABLE users RENAME CONSTRAINT accounts_pkey TO users_pkey;
ALTER TABLE users RENAME CONSTRAINT accounts_nickname_check TO users_nickname_check;
ALTER TABLE users RENAME CONSTRAINT accounts_avatar_code_check TO users_avatar_code_check;

ALTER TABLE email_credentials RENAME COLUMN account_id TO user_id;
ALTER TABLE email_credentials RENAME CONSTRAINT email_credentials_account_id_fkey
    TO email_credentials_user_id_fkey;

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

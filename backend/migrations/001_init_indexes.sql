CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_sid_hash ON sessions(sid_hash);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_composite ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at) WHERE revoked_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_revoked ON sessions(revoked_at) WHERE revoked_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_passcodes_phone_purpose ON passcodes(phone, purpose);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_passcodes_phone_expires ON passcodes(phone, expires_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_passcodes_purpose_expires ON passcodes(purpose, expires_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_establishment ON memberships(establishment_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_active ON memberships(user_id, establishment_id) WHERE revoked_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_revoked ON memberships(revoked_at) WHERE revoked_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_phone_lower ON users(LOWER(phone));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created ON users(created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_establishments_name ON establishments(name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_establishments_created ON establishments(created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingredients_name ON ingredients(name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingredients_active ON ingredients(is_active) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_preparations_name ON preparations(name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_preparations_active ON preparations(is_active) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prep_items_composite ON preparation_items(preparation_id, item_type, item_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_events_created_at_desc ON auth_events(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_events_type_created_desc ON auth_events(event_type, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_events_user_id ON auth_events(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_events_phone ON auth_events(phone);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_events_ip_created_desc ON auth_events(ip, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_sid_hash ON sessions(sid_hash);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at) WHERE revoked_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_passcodes_phone_purpose ON passcodes(phone, purpose);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_passcodes_phone_expires ON passcodes(phone, expires_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_passcodes_active_attempts ON passcodes(phone, purpose, attempts_left) WHERE attempts_left > 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_phone_verifications_expires ON phone_verifications(expires_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_user_active ON memberships(user_id) WHERE revoked_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_establishment_active ON memberships(establishment_id) WHERE revoked_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created ON users(created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_establishments_name ON establishments(name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingredients_establishment_name ON ingredients(establishment_id, name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingredients_active ON ingredients(establishment_id, is_active) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_preparations_establishment_title ON preparations(establishment_id, title);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_preparations_active ON preparations(establishment_id, is_active) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prep_components_preparation ON preparation_components(preparation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prep_components_ingredient ON preparation_components(ingredient_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prep_components_nested_preparation ON preparation_components(nested_preparation_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cocktails_establishment_title ON cocktails(establishment_id, title);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cocktails_active ON cocktails(establishment_id, is_active) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cocktail_components_cocktail ON cocktail_components(cocktail_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cocktail_components_ingredient ON cocktail_components(ingredient_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cocktail_components_preparation ON cocktail_components(preparation_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_requests_establishment_created ON operation_requests(establishment_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_requests_status ON operation_requests(establishment_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_requests_kind ON operation_requests(establishment_id, kind);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_invitations_establishment_created ON team_invitations(establishment_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_invitations_phone_active ON team_invitations(establishment_id, invited_phone) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_invitations_token_hash ON team_invitations(token_hash);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quiz_attempts_establishment_created ON quiz_attempts(establishment_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quiz_attempts_user_created ON quiz_attempts(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shift_kpis_establishment_date ON shift_kpis(establishment_id, shift_date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shift_kpis_recorded_by ON shift_kpis(recorded_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_events_created_desc ON auth_events(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_events_type_created_desc ON auth_events(event_type, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_events_user ON auth_events(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_events_phone ON auth_events(phone);

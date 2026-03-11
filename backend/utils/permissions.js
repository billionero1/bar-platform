const ROLE_PERMISSION_MATRIX = {
  manager: [
    'dashboard:view',
    'establishment:create',

    'ingredients:read',
    'ingredients:create',
    'ingredients:update',
    'ingredients:delete',

    'preparations:read',
    'preparations:create',
    'preparations:calc',
    'preparations:delete',

    'cocktails:read',
    'cocktails:create',
    'cocktails:update',
    'cocktails:calc',
    'cocktails:upload_photo',
    'cocktails:delete',

    'forms:read',
    'forms:create',
    'forms:update_own',
    'forms:update_any',
    'forms:manage_status',
    'forms:export',

    'team:read',
    'team:manage',

    'invites:read',
    'invites:create',
    'invites:cancel',

    'docs:read',
    'docs:export',

    'training:read',
    'training:manage',

    'tests:take',
    'tests:analytics_own',
    'tests:analytics_team',
    'tests:manage',
  ],

  staff: [
    'dashboard:view',

    'ingredients:read',

    'preparations:read',
    'preparations:create',
    'preparations:calc',

    'cocktails:read',
    'cocktails:create',
    'cocktails:calc',
    'cocktails:upload_photo',

    'forms:read',
    'forms:create',
    'forms:update_own',

    'team:read',

    'docs:read',

    'training:read',

    'tests:take',
    'tests:analytics_own',
  ],

  solo: [
    'dashboard:view',
    'establishment:create',

    'ingredients:read',
    'ingredients:create',
    'ingredients:update',
    'ingredients:delete',

    'preparations:read',
    'preparations:create',
    'preparations:calc',
    'preparations:delete',

    'cocktails:read',
    'cocktails:create',
    'cocktails:update',
    'cocktails:calc',
    'cocktails:upload_photo',
    'cocktails:delete',

    'forms:read',
    'forms:create',
    'forms:update_own',
    'forms:update_any',
    'forms:manage_status',
    'forms:export',

    'docs:read',
    'docs:export',

    'training:read',
    'training:manage',

    'tests:take',
    'tests:analytics_own',
    'tests:analytics_team',
    'tests:manage',
  ],
};

export function normalizeRole(rawRole) {
  if (rawRole === 'manager') return 'manager';
  if (rawRole === 'staff') return 'staff';
  return 'solo';
}

export function listPermissionsForRole(rawRole) {
  const role = normalizeRole(rawRole);
  const permissions = ROLE_PERMISSION_MATRIX[role] || [];
  return [...new Set(permissions)];
}

function matchPermission(permissionSet, permission) {
  if (permissionSet.has('*')) return true;
  if (permissionSet.has(permission)) return true;

  const [domain] = String(permission).split(':');
  if (domain && permissionSet.has(`${domain}:*`)) return true;
  return false;
}

export function hasPermission(userOrRole, permission) {
  if (!permission) return false;

  if (userOrRole && typeof userOrRole === 'object' && Array.isArray(userOrRole.permissions)) {
    return matchPermission(new Set(userOrRole.permissions), permission);
  }

  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  const list = listPermissionsForRole(role);
  return matchPermission(new Set(list), permission);
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'invalid_session', code: 'INVALID_SESSION' });
    }

    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    return next();
  };
}

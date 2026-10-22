// Demo identities are test accounts, never password credentials.
export const demoIdentities = Object.freeze([
  Object.freeze({ id: 'demo-admin', name: 'Demo Admin', role: 'admin' }),
  Object.freeze({ id: 'demo-rd', name: 'Demo RD', role: 'rd' }),
  Object.freeze({ id: 'demo-staff', name: 'Demo Staff', role: 'staff' }),
]);

export function demoLoginAllowed(value) {
  if (value === undefined || value === null || value === '') return false;
  return value === true || value === 'true';
}

export function demoIdentity(role) {
  return demoIdentities.find(identity => identity.role === role);
}

export function isDemoUser(user) {
  const identity = demoIdentity(user?.role);
  return Boolean(identity && user.id === identity.id && user.authMode === 'demo'
    && user.enabled !== false && !user.deletedAt
    && !Object.hasOwn(user, 'password') && !Object.hasOwn(user, 'passwordHash'));
}

export function createDemoUsers(roleDefaults) {
  return demoIdentities.map(identity => ({ ...identity, authMode: 'demo',
    enabled: true, inheritRole: true,
    lines: [...roleDefaults[identity.role].lines],
    views: [...roleDefaults[identity.role].views],
    permissions: [...roleDefaults[identity.role].permissions],
  }));
}

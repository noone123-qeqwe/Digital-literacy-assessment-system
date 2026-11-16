function isMfaRequired(user) {
  if (!['admin', 'assessor'].includes(user.role)) return false;
  // An enrolled authenticator is still checked. Only an explicit account policy
  // lets an unenrolled user sign in with their verified email and password.
  return user.mfa_enabled === 1 || user.mfa_optional !== '1';
}

module.exports = { isMfaRequired };

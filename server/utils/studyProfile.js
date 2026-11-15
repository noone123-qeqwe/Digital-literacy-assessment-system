const { db } = require('../db/database');

function getStudyProfile(userId) {
  const profile = db.prepare(`
    SELECT age, sex, municipality, barangay,
           junior_high_school, junior_high_school_type,
           senior_high_school, senior_high_school_type, shs_strand,
           monthly_family_income_amount, has_computer_at_home, internet_access_type,
           profile_consent_version
    FROM respondent_profiles WHERE user_id = ?
  `).get(userId);
  const isComplete = Boolean(
    profile?.age > 0 && profile.sex && profile.municipality && profile.barangay &&
    profile.junior_high_school && profile.junior_high_school_type &&
    profile.senior_high_school && profile.senior_high_school_type && profile.shs_strand &&
    profile.monthly_family_income_amount !== null && profile.monthly_family_income_amount !== undefined &&
    profile.has_computer_at_home !== null && profile.has_computer_at_home !== undefined &&
    profile.internet_access_type
  );
  return { profile, isComplete, isMinor: Boolean(profile?.age > 0 && profile.age < 18) };
}

module.exports = { getStudyProfile };

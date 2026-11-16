const bcrypt = require('bcryptjs');
const { db } = require('./database');

// 1. Create or update Admin test account
const adminEmail = 'admin@dlas.edu.ph';
const adminExisting = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
let adminId;
const adminHash = bcrypt.hashSync('Admin@123', 10);
if (!adminExisting) {
  const res = db.prepare(
    "INSERT INTO users (email, password, first_name, last_name, role, status, email_verified, is_demo) VALUES (?, ?, ?, ?, 'admin', 'active', 1, 1)"
  ).run(adminEmail, adminHash, 'System', 'Administrator');
  adminId = res.lastInsertRowid;
  console.log('Created Admin account:', adminEmail, 'ID:', adminId);
} else {
  adminId = adminExisting.id;
  db.prepare(
    "UPDATE users SET password = ?, status = 'active', email_verified = 1, is_demo = 1 WHERE id = ?"
  ).run(adminHash, adminId);
  console.log('Updated Admin account:', adminEmail, 'ID:', adminId);
}

// 2. Create or update Teacher / Assessor test account
const teacherEmail = 'teacher@dlas.edu.ph';
const teacherExisting = db.prepare('SELECT id FROM users WHERE email = ?').get(teacherEmail);
let teacherId;
const teacherHash = bcrypt.hashSync('Teacher@123', 10);
if (!teacherExisting) {
  const res = db.prepare(
    "INSERT INTO users (email, password, first_name, last_name, role, status, email_verified, is_demo) VALUES (?, ?, ?, ?, 'assessor', 'active', 1, 1)"
  ).run(teacherEmail, teacherHash, 'Faculty', 'Teacher');
  teacherId = res.lastInsertRowid;
  console.log('Created Teacher account:', teacherEmail, 'ID:', teacherId);
} else {
  teacherId = teacherExisting.id;
  db.prepare(
    "UPDATE users SET password = ?, status = 'active', email_verified = 1, is_demo = 1 WHERE id = ?"
  ).run(teacherHash, teacherId);
  console.log('Updated Teacher account:', teacherEmail, 'ID:', teacherId);
}

// 3. Also create assessor@dlas.edu.ph for convenience
const assessorEmail = 'assessor@dlas.edu.ph';
const assessorExisting = db.prepare('SELECT id FROM users WHERE email = ?').get(assessorEmail);
const assessorHash = bcrypt.hashSync('Assessor@123', 10);
if (!assessorExisting) {
  const res = db.prepare(
    "INSERT INTO users (email, password, first_name, last_name, role, status, email_verified, is_demo) VALUES (?, ?, ?, ?, 'assessor', 'active', 1, 1)"
  ).run(assessorEmail, assessorHash, 'Assessor', 'Faculty');
  console.log('Created Assessor account:', assessorEmail, 'ID:', res.lastInsertRowid);
} else {
  db.prepare(
    "UPDATE users SET password = ?, status = 'active', email_verified = 1, is_demo = 1 WHERE id = ?"
  ).run(assessorHash, assessorExisting.id);
  console.log('Updated Assessor account:', assessorEmail, 'ID:', assessorExisting.id);
}

// 4. Update assessment assignments to be assigned by teacher so teacher monitors this cohort
const updated = db.prepare('UPDATE assessment_assignments SET assigned_by = ? WHERE assessment_id = 1').run(teacherId);
console.log('Updated assessment_assignments assigned_by to teacherId:', updated.changes);

console.log('--- All Users in Database ---');
const users = db.prepare('SELECT id, email, first_name, last_name, role, status, email_verified, mfa_enabled, is_demo FROM users').all();
console.table(users);


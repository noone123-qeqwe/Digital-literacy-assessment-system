const bcrypt = require('bcryptjs');

function ensureStaffAccounts(db) {
  try {
    const adminHash = bcrypt.hashSync('Admin@123', 10);
    const teacherHash = bcrypt.hashSync('Teacher@123', 10);
    const studentHash = bcrypt.hashSync('User@123', 10);

    const existingAdmin = db.prepare("SELECT id FROM users WHERE email = 'admin@dlas.edu.ph'").get();
    if (!existingAdmin) {
      db.prepare(`
        INSERT INTO users (email, password, first_name, last_name, role, status, email_verified, is_demo)
        VALUES ('admin@dlas.edu.ph', ?, 'System', 'Administrator', 'admin', 'active', 1, 0)
      `).run(adminHash);
      console.info('Ensured administrator account: admin@dlas.edu.ph');
    } else {
      db.prepare("UPDATE users SET password = ?, status = 'active', email_verified = 1 WHERE email = 'admin@dlas.edu.ph'").run(adminHash);
    }

    const existingTeacher = db.prepare("SELECT id FROM users WHERE email = 'teacher@dlas.edu.ph'").get();
    let teacherId;
    if (!existingTeacher) {
      const result = db.prepare(`
        INSERT INTO users (email, password, first_name, last_name, role, status, email_verified, is_demo)
        VALUES ('teacher@dlas.edu.ph', ?, 'Faculty', 'Teacher', 'assessor', 'active', 1, 0)
      `).run(teacherHash);
      teacherId = result.lastInsertRowid;
      console.info('Ensured teacher account: teacher@dlas.edu.ph');
    } else {
      teacherId = existingTeacher.id;
      db.prepare("UPDATE users SET password = ?, status = 'active', email_verified = 1 WHERE email = 'teacher@dlas.edu.ph'").run(teacherHash);
    }

    const existingStudent = db.prepare("SELECT id FROM users WHERE email = 'maria.santos@example.com'").get();
    if (!existingStudent) {
      const res = db.prepare(`
        INSERT INTO users (email, password, first_name, last_name, role, status, email_verified, is_demo)
        VALUES ('maria.santos@example.com', ?, 'Maria', 'Santos', 'respondent', 'active', 1, 1)
      `).run(studentHash);
      db.prepare('INSERT OR IGNORE INTO respondent_profiles (user_id) VALUES (?)').run(res.lastInsertRowid);
    }

    if (teacherId) {
      db.prepare('UPDATE assessment_assignments SET assigned_by = ? WHERE assigned_by IS NULL').run(teacherId);
    }
  } catch (err) {
    console.error('Error ensuring staff accounts:', err.message);
  }
}

module.exports = { ensureStaffAccounts };

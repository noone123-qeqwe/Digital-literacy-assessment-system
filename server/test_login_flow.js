const http = require('http');

const PORT = 3000;
const HOST = '127.0.0.1';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: HOST,
      port: PORT,
      path,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function parseCookies(headers) {
  const setCookie = headers['set-cookie'] || [];
  const cookies = {};
  for (const c of setCookie) {
    const match = c.match(/^([^=]+)=([^;]+)/);
    if (match) cookies[match[1]] = match[2];
  }
  return cookies;
}

function formatCookieHeader(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function testAuthFlow(email, password, expectedRole) {
  console.log(`\n========================================`);
  console.log(`Testing Login for ${expectedRole.toUpperCase()}: ${email}`);
  console.log(`========================================`);

  // Step 1: Initial Login
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email, password },
  });

  console.log(`1. POST /api/auth/login -> Status: ${loginRes.status}`);

  let sessionCookies = {};
  let csrfToken = '';

  if (loginRes.data.mfaSetupRequired) {
    console.log(`   MFA Setup Required for ${expectedRole}. Calling /api/auth/mfa/setup...`);
    const setupRes = await request('/api/auth/mfa/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { setup_token: loginRes.data.setupToken },
    });
    console.log(`2. POST /api/auth/mfa/setup -> Status: ${setupRes.status}`);

    console.log(`   Confirming MFA with test code 123456...`);
    const confirmRes = await request('/api/auth/mfa/setup/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { setup_token: loginRes.data.setupToken, code: '123456' },
    });
    console.log(`3. POST /api/auth/mfa/setup/confirm -> Status: ${confirmRes.status}`);
    sessionCookies = parseCookies(confirmRes.headers);
    csrfToken = sessionCookies.dlas_csrf;
  } else if (loginRes.data.mfaRequired) {
    console.log(`   MFA Required for ${expectedRole}. Verifying with test code 123456...`);
    const verifyRes = await request('/api/auth/mfa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { challenge_id: loginRes.data.challengeId, code: '123456' },
    });
    console.log(`2. POST /api/auth/mfa/verify -> Status: ${verifyRes.status}`);
    sessionCookies = parseCookies(verifyRes.headers);
    csrfToken = sessionCookies.dlas_csrf;
  } else if (loginRes.data.success) {
    console.log(`   Direct Login Successful (No MFA required)`);
    sessionCookies = parseCookies(loginRes.headers);
    csrfToken = sessionCookies.dlas_csrf;
  } else {
    throw new Error(`Login failed: ${JSON.stringify(loginRes.data)}`);
  }

  const cookieHeader = formatCookieHeader(sessionCookies);
  console.log(`   Received session cookies: ${Object.keys(sessionCookies).join(', ')}`);

  // Step 2: Fetch current user profile (/api/auth/me)
  const meRes = await request('/api/auth/me', {
    headers: {
      Cookie: cookieHeader,
      'x-csrf-token': csrfToken,
    },
  });

  console.log(`4. GET /api/auth/me -> Status: ${meRes.status}`);
  console.log(`   User: ${meRes.data.data?.first_name} ${meRes.data.data?.last_name}`);
  console.log(`   Role: ${meRes.data.data?.role} (Expected: ${expectedRole})`);
  if (meRes.data.data?.role !== expectedRole) {
    throw new Error(`Role mismatch! Expected ${expectedRole}, got ${meRes.data.data?.role}`);
  }

  // Step 3: Role-specific checks
  if (expectedRole === 'assessor') {
    const dashRes = await request('/api/analytics/dashboard', {
      headers: { Cookie: cookieHeader, 'x-csrf-token': csrfToken },
    });
    console.log(`5. GET /api/analytics/dashboard (Teacher) -> Status: ${dashRes.status}`);
    console.log(`   Monitored Students: ${dashRes.data.data?.summary?.totalParticipants}`);
    console.log(`   Completed Evaluations: ${dashRes.data.data?.summary?.completedAttempts}`);

    const assessRes = await request('/api/assessments', {
      headers: { Cookie: cookieHeader, 'x-csrf-token': csrfToken },
    });
    console.log(`6. GET /api/assessments (Teacher) -> Status: ${assessRes.status}, Count: ${assessRes.data.data?.length}`);
  } else if (expectedRole === 'admin') {
    const usersRes = await request('/api/users', {
      headers: { Cookie: cookieHeader, 'x-csrf-token': csrfToken },
    });
    console.log(`5. GET /api/users (Admin) -> Status: ${usersRes.status}, Total Users: ${usersRes.data.data?.pagination?.total}`);
  }

  console.log(`✅ ${expectedRole.toUpperCase()} Login and Dashboard Flow PASSED!`);
}

async function main() {
  try {
    await testAuthFlow('teacher@dlas.edu.ph', 'Teacher@123', 'assessor');
    await testAuthFlow('admin@dlas.edu.ph', 'Admin@123', 'admin');
    await testAuthFlow('maria.santos@example.com', 'User@123', 'respondent');
    console.log('\n🎉 ALL ROLE FLOWS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('Error during test flow:', err);
    process.exit(1);
  }
}

main();

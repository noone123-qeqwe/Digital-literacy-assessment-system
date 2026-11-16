require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { initializeDatabase } = require('./db/database');
const { db } = require('./db/database');
const { ensureDigCompSatQuestionBank } = require('./db/digcompsat');
const { assertProductionReady } = require('./utils/studyReadiness');
const { startAutomaticBackups, getBackupStatus } = require('./db/backup');
const { startWebsitePing } = require('./utils/websitePing');

const app = express();
const PORT = process.env.PORT || 3000;
const freeDemoMode = process.env.DLAS_FREE_DEMO === 'true';
// On Render's default domain, keep account verification links and same-origin
// API requests on this service. A custom domain can override both values.
if (process.env.RENDER_EXTERNAL_HOSTNAME) {
  const renderOrigin = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
  process.env.CLIENT_URL ||= renderOrigin;
  process.env.CORS_ORIGINS ||= renderOrigin;
}
const configuredTrustProxy = process.env.TRUST_PROXY?.trim();
if (configuredTrustProxy) {
  const trustProxy = /^\d+$/.test(configuredTrustProxy)
    ? Number(configuredTrustProxy)
    : configuredTrustProxy.split(',').map((value) => value.trim()).filter(Boolean);
  app.set('trust proxy', trustProxy);
}
if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32 || /changeme|replace.?me|secret/i.test(secret)) {
    throw new Error('Production startup requires a non-default JWT_SECRET of at least 32 characters.');
  }
}

// Initialize Database Schema
try {
  initializeDatabase();
  ensureDigCompSatQuestionBank(db);
  if (process.env.NODE_ENV !== 'production' || freeDemoMode) require('./db/knowledgeDemo').seedKnowledgeDemo(db);
  if (!freeDemoMode) assertProductionReady();
  console.log('Database initialized successfully.');
} catch (err) {
  console.error('Database initialization error:', err);
  throw err;
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // Local photo optimization and authenticated avatar previews use blob URLs.
      // Keep Helmet's other defaults, including the existing script restrictions.
      imgSrc: ["'self'", 'data:', 'blob:'],
    },
  },
}));
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length
  ? configuredOrigins
  : process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    db.prepare('SELECT 1 AS connected').get();
  } catch {
    return res.status(503).json({ status: 'unavailable', service: 'Digital Literacy Assessment System API' });
  }
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Digital Literacy Assessment System API',
    selfPing: app.locals.websitePing?.status() || { enabled: false, intervalSeconds: 60, lastCheckedAt: null, lastHealthyAt: null, lastStatus: 'disabled' },
    encryptedBackupReady: process.env.NODE_ENV !== 'production' || getBackupStatus().encryptedBackupReady,
    dataProtectionReady: process.env.NODE_ENV !== 'production' || getBackupStatus().isReady,
  });
});

app.use('/api', (req, res, next) => {
  if (freeDemoMode) {
    const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const allowedAuthAction = req.method === 'POST' && ['/auth/login', '/auth/logout'].includes(req.path);
    if (!safeMethod && !allowedAuthAction) {
      return res.status(403).json({
        success: false,
        message: 'This free demo is read-only. Registration, profile changes, assessment submissions, withdrawals, and other data changes are disabled. Do not enter real study data.',
      });
    }
    return next();
  }
  if (process.env.NODE_ENV === 'production' && !getBackupStatus().isReady) {
    return res.status(503).json({ success: false, message: 'Database recovery protection is not ready. Please try again shortly.' });
  }
  next();
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/system', require('./routes/system'));
app.use('/api/users', require('./routes/users'));
app.use('/api/assessments', require('./routes/assessments'));
app.use('/api/questions', require('./routes/questions'));
app.use('/api/attempts', require('./routes/attempts'));
app.use('/api/consents', require('./routes/consents'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/export', require('./routes/export'));
app.use('/api/learning', require('./routes/learning'));
app.use('/api/knowledge', require('./routes/knowledge'));
app.use('/api/bookmarks', require('./routes/bookmarks'));

// 404 Handler for API
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// In production the Express service also serves the built React app, allowing
// secure cookies and the API to share one HTTPS origin.
const clientBuildPath = require('path').resolve(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath, { index: false, maxAge: '1h' }));
app.get('*', (req, res, next) => {
  res.sendFile(require('path').join(clientBuildPath, 'index.html'), (error) => {
    if (error) next(error);
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: status >= 500 ? 'Internal Server Error' : err.message || 'Request failed'
  });
});

function startServer(port = PORT) {
  let websitePing;
  if (process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_STRATEGY === 'turso-pitr') {
    startAutomaticBackups()
      .catch((error) => console.error('Initial encrypted backup failed; API remains unavailable until a retry succeeds:', error.message));
  } else if (process.env.NODE_ENV === 'production' && !freeDemoMode) {
    throw new Error('Production startup requires automatic encrypted backups. Configure BACKUP_ENCRYPTION_KEY.');
  }
  const server = app.listen(port, () => {
    const address = server.address();
    console.log('=======================================================');
    console.log('  Digital Literacy Assessment System Backend');
    console.log(`  Listening on port ${typeof address === 'object' ? address.port : port}`);
    console.log('  API Health: /api/health');
    console.log('=======================================================');
    if (process.env.NODE_ENV !== 'test') {
      websitePing = startWebsitePing();
      app.locals.websitePing = websitePing;
    }
  });
  server.once('close', () => websitePing?.stop());
  return server;
}

if (require.main === module) {
  try { startServer(); } catch (error) {
  console.error('Server startup failed:', error.message);
  process.exitCode = 1;
  }
}

module.exports = { app, startServer };


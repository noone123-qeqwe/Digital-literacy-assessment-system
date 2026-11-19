import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { DemoModeProvider } from './contexts/DemoModeContext';
import { useAuth } from './contexts/useAuth';
import Layout from './components/layout/Layout';
import LoadingSpinner from './components/common/LoadingSpinner';
import RouteErrorBoundary from './components/common/RouteErrorBoundary';
import { lazyWithRetry } from './utils/lazyWithRetry';
// Recovery must not depend on fetching a page chunk after navigation.
import AccountActionPage from './pages/auth/AccountActionPage';

const LoginPage = lazyWithRetry(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazyWithRetry(() => import('./pages/auth/RegisterPage'));
const GuardianConsentPage = lazyWithRetry(() => import('./pages/auth/GuardianConsentPage'));
const AdminDashboard = lazyWithRetry(() => import('./pages/admin/AdminDashboard'));
const AssessmentsManagement = lazyWithRetry(() => import('./pages/admin/AssessmentsManagement'));
const UsersManagement = lazyWithRetry(() => import('./pages/admin/UsersManagement'));
const QuestionsBank = lazyWithRetry(() => import('./pages/admin/QuestionsBank'));
const ReportsAnalytics = lazyWithRetry(() => import('./pages/admin/ReportsAnalytics'));
const RespondentDashboard = lazyWithRetry(() => import('./pages/respondent/RespondentDashboard'));
const RespondentAssessments = lazyWithRetry(() => import('./pages/respondent/RespondentAssessments'));
const TakeAssessment = lazyWithRetry(() => import('./pages/respondent/TakeAssessment'));
const AssessmentResults = lazyWithRetry(() => import('./pages/respondent/AssessmentResults'));
const RespondentProfile = lazyWithRetry(() => import('./pages/respondent/RespondentProfile'));
const SecuritySettings = lazyWithRetry(() => import('./pages/respondent/SecuritySettings'));
const StudentHelp = lazyWithRetry(() => import('./pages/respondent/StudentHelp'));
const LearningHub = lazyWithRetry(() => import('./pages/learning/LearningHub'));
const KnowledgeBank = lazyWithRetry(() => import('./pages/knowledge/KnowledgeBank'));
const KnowledgeAssessments = lazyWithRetry(() => import('./pages/knowledge/KnowledgeAssessments'));
const KnowledgeAttempt = lazyWithRetry(() => import('./pages/knowledge/KnowledgeAttempt'));
const KnowledgeRecords = lazyWithRetry(() => import('./pages/knowledge/KnowledgeRecords'));
const KnowledgeMaterials = lazyWithRetry(() => import('./pages/knowledge/KnowledgeMaterials'));

const RoutedErrorBoundary = ({ children }) => {
  const location = useLocation();
  return <RouteErrorBoundary resetKey={location.pathname}>{children}</RouteErrorBoundary>;
};

// Route Guard Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner text="Authenticating session..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to user's appropriate default page
    if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
    return <Navigate to="/respondent/dashboard" replace />;
  }

  return children;
};

// Root Redirect Component
const RoleRedirect = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner text="Starting DLAS..." />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/respondent/dashboard" replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <DemoModeProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#17243a',
                fontSize: '13px',
                fontWeight: '600',
                padding: '12px 14px',
                boxShadow: '0 12px 30px -10px rgba(15, 23, 42, 0.16)',
              },
            }}
          />
          <RoutedErrorBoundary>
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><LoadingSpinner text="Loading page..." /></div>}>
            <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<AccountActionPage />} />
          <Route path="/forgot-password" element={<AccountActionPage />} />
          <Route path="/reset-password" element={<AccountActionPage />} />
          <Route path="/recover-mfa" element={<AccountActionPage />} />
          <Route path="/guardian-consent" element={<GuardianConsentPage />} />

          {/* Root Redirect */}
          <Route path="/" element={<RoleRedirect />} />

          {/* Protected Application Routes inside Layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {['admin', 'respondent'].map((role) => <React.Fragment key={role}>
              <Route path={`/${role}/knowledge`} element={<ProtectedRoute allowedRoles={[role]}><KnowledgeAssessments /></ProtectedRoute>} />
              {['results', 'progress', 'certificates', ...(role === 'respondent' ? [] : ['analytics'])].map((section) => <Route key={section} path={`/${role}/${section}`} element={<ProtectedRoute allowedRoles={[role]}><KnowledgeRecords key={`${role}-${section}`} mode={section === 'analytics' ? 'reports' : section} /></ProtectedRoute>} />)}
            </React.Fragment>)}
            <Route path="/admin/categories" element={<ProtectedRoute allowedRoles={['admin']}><KnowledgeBank categoriesOnly /></ProtectedRoute>} />
            <Route path="/admin/knowledge/questions" element={<ProtectedRoute allowedRoles={['admin']}><KnowledgeBank /></ProtectedRoute>} />
            <Route path="/admin/materials" element={<ProtectedRoute allowedRoles={['admin']}><KnowledgeMaterials /></ProtectedRoute>} />
            <Route path="/respondent/materials" element={<ProtectedRoute allowedRoles={['respondent']}><KnowledgeMaterials /></ProtectedRoute>} />
            <Route path="/respondent/knowledge/attempts/:attemptId" element={<ProtectedRoute allowedRoles={['respondent', 'admin']}><KnowledgeAttempt /></ProtectedRoute>} />
            {/* Admin Routes */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/assessments"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AssessmentsManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <UsersManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/questions"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <QuestionsBank />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/reports"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ReportsAnalytics />
                </ProtectedRoute>
              }
            />
            <Route path="/admin/learning" element={<ProtectedRoute allowedRoles={['admin']}><LearningHub /></ProtectedRoute>} />

            {/* Respondent Routes */}
            <Route
              path="/respondent/dashboard"
              element={
              <ProtectedRoute allowedRoles={['respondent']}>
                  <RespondentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/respondent/assessments"
              element={
              <ProtectedRoute allowedRoles={['respondent']}>
                  <RespondentAssessments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/respondent/assessments/:id/take"
              element={
              <ProtectedRoute allowedRoles={['respondent']}>
                  <TakeAssessment />
                </ProtectedRoute>
              }
            />
            <Route
              path="/respondent/assessments/:attemptId/results"
              element={
                <ProtectedRoute allowedRoles={['respondent', 'admin']}>
                  <AssessmentResults />
                </ProtectedRoute>
              }
            />
            <Route
              path="/respondent/profile"
              element={
                <ProtectedRoute allowedRoles={['respondent', 'admin']}>
                  <RespondentProfile />
                </ProtectedRoute>
              }
            />
            <Route path="/respondent/learning" element={<ProtectedRoute allowedRoles={['respondent']}><LearningHub /></ProtectedRoute>} />
            <Route path="/respondent/help" element={<ProtectedRoute allowedRoles={['respondent']}><StudentHelp /></ProtectedRoute>} />
            <Route
              path="/security"
              element={
                <ProtectedRoute allowedRoles={['respondent', 'admin']}>
                  <SecuritySettings />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </RoutedErrorBoundary>
        </DemoModeProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

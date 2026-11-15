import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { useAuth } from './contexts/useAuth';
import Layout from './components/layout/Layout';
import LoadingSpinner from './components/common/LoadingSpinner';
import DemoModeIndicator from './components/common/DemoModeIndicator';

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const AccountActionPage = lazy(() => import('./pages/auth/AccountActionPage'));
const GuardianConsentPage = lazy(() => import('./pages/auth/GuardianConsentPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AssessmentsManagement = lazy(() => import('./pages/admin/AssessmentsManagement'));
const UsersManagement = lazy(() => import('./pages/admin/UsersManagement'));
const QuestionsBank = lazy(() => import('./pages/admin/QuestionsBank'));
const ReportsAnalytics = lazy(() => import('./pages/admin/ReportsAnalytics'));
const AssessorDashboard = lazy(() => import('./pages/assessor/AssessorDashboard'));
const RespondentDashboard = lazy(() => import('./pages/respondent/RespondentDashboard'));
const RespondentAssessments = lazy(() => import('./pages/respondent/RespondentAssessments'));
const TakeAssessment = lazy(() => import('./pages/respondent/TakeAssessment'));
const AssessmentResults = lazy(() => import('./pages/respondent/AssessmentResults'));
const RespondentProfile = lazy(() => import('./pages/respondent/RespondentProfile'));
const SecuritySettings = lazy(() => import('./pages/respondent/SecuritySettings'));
const StudentHelp = lazy(() => import('./pages/respondent/StudentHelp'));
const LearningHub = lazy(() => import('./pages/learning/LearningHub'));

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
    if (user.role === 'assessor') return <Navigate to="/assessor/dashboard" replace />;
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
  if (user.role === 'assessor') return <Navigate to="/assessor/dashboard" replace />;
  return <Navigate to="/respondent/dashboard" replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <DemoModeIndicator />
        <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
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
                <ProtectedRoute allowedRoles={['admin', 'assessor']}>
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
                <ProtectedRoute allowedRoles={['admin', 'assessor']}>
                  <ReportsAnalytics />
                </ProtectedRoute>
              }
            />
            <Route path="/admin/learning" element={<ProtectedRoute allowedRoles={['admin']}><LearningHub /></ProtectedRoute>} />

            {/* Assessor Routes */}
            <Route
              path="/assessor/dashboard"
              element={
                <ProtectedRoute allowedRoles={['assessor', 'admin']}>
                  <AssessorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/assessor/assessments"
              element={
                <ProtectedRoute allowedRoles={['assessor', 'admin']}>
                  <AssessmentsManagement />
                </ProtectedRoute>
              }
            />

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
                <ProtectedRoute allowedRoles={['respondent', 'assessor', 'admin']}>
                  <AssessmentResults />
                </ProtectedRoute>
              }
            />
            <Route
              path="/respondent/profile"
              element={
                <ProtectedRoute allowedRoles={['respondent', 'admin', 'assessor']}>
                  <RespondentProfile />
                </ProtectedRoute>
              }
            />
            <Route path="/respondent/learning" element={<ProtectedRoute allowedRoles={['respondent']}><LearningHub /></ProtectedRoute>} />
            <Route path="/respondent/help" element={<ProtectedRoute allowedRoles={['respondent']}><StudentHelp /></ProtectedRoute>} />
            <Route
              path="/security"
              element={
                <ProtectedRoute allowedRoles={['respondent', 'assessor', 'admin']}>
                  <SecuritySettings />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

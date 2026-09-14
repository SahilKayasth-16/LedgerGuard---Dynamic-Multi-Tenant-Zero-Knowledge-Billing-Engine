import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import OverviewPage from '../pages/OverviewPage';
import LedgerPage from '../pages/LedgerPage';
import AnalyticsPage from '../pages/AnalyticsPage';
import SettingsPage from '../pages/SettingsPage';
import DashboardLayout from '../layouts/DashboardLayout';
import ProtectedRoute from './ProtectedRoute';
import PublicOnlyRoute from './PublicOnlyRoute';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/dashboard/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="ledger" element={<LedgerPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/dashboard/overview" replace />} />
      <Route path="*" element={<Navigate to="/dashboard/overview" replace />} />
    </Routes>
  );
};

export default AppRoutes;

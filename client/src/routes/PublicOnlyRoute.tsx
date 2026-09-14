import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const PublicOnlyRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif', color: '#64748B' }}>
        Loading session...
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard/overview" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default PublicOnlyRoute;


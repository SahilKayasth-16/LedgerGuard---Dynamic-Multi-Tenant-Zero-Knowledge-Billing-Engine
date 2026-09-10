import React from 'react';
import { useAuth } from '../hooks/useAuth';

const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', color: '#4F46E5', margin: 0 }}>LedgerGuard Dashboard</h1>
        <button
          onClick={logout}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#EF4444',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Logout
        </button>
      </div>

      <div style={{ padding: '1.5rem', backgroundColor: '#F3F4F6', borderRadius: '8px', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginTop: 0, color: '#1F2937' }}>Authenticated Identity Context</h2>
        <p style={{ margin: '0.5rem 0', color: '#374151' }}>
          <strong>User ID:</strong> <code>{user?.userId}</code>
        </p>
        <p style={{ margin: '0.5rem 0', color: '#374151' }}>
          <strong>Tenant ID:</strong> <code style={{ backgroundColor: '#E0E7FF', color: '#3730A3', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{user?.tenantId}</code>
        </p>
        <p style={{ margin: '0.5rem 0', color: '#374151' }}>
          <strong>Role:</strong> <code>{user?.role}</code>
        </p>
      </div>

      <p style={{ color: '#6B7280' }}>Dashboard placeholder — Multi-tenant architecture foundation active.</p>
    </div>
  );
};

export default DashboardPage;

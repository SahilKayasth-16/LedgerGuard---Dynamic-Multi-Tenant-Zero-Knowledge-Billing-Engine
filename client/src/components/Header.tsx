import React from 'react';
import { useAuth } from '../hooks/useAuth';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();

  const getCompanyName = (tenantId?: string) => {
    if (tenantId === 'tenant-company-a') return 'Company A Corp';
    if (tenantId === 'tenant-company-b') return 'Company B Inc';
    return tenantId || 'Enterprise Tenant';
  };

  return (
    <header style={{ height: '64px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0', padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box' }}>
      <div>
        <span style={{ fontSize: '0.875rem', color: '#64748B', marginRight: '0.5rem' }}>Tenant:</span>
        <strong style={{ fontSize: '1rem', color: '#0F172A' }}>{getCompanyName(user?.tenantId)}</strong>
        <span style={{ marginLeft: '0.75rem', fontSize: '0.75rem', backgroundColor: '#EEF2FF', color: '#4F46E5', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
          {user?.tenantId}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E293B' }}>{user?.userId}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Role: {user?.role || 'ADMIN'}</div>
        </div>

        <button
          onClick={logout}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#F1F5F9',
            color: '#0F172A',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Logout
        </button>
      </div>
    </header>
  );
};

export default Header;


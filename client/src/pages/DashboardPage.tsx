import React from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../hooks/useAuth';

const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  const getCompanyName = (tenantId?: string) => {
    if (tenantId === 'tenant-company-a') return 'Company A Corp';
    if (tenantId === 'tenant-company-b') return 'Company B Inc';
    return tenantId || 'Enterprise Tenant';
  };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.75rem', color: '#0F172A', marginTop: 0, marginBottom: '0.5rem' }}>
          Welcome back to LedgerGuard
        </h1>
        <p style={{ color: '#64748B', marginBottom: '2rem' }}>
          Dynamic Multi-Tenant Zero-Knowledge Billing Engine
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ padding: '1.5rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Authenticated Tenant
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1E293B', marginTop: '0.5rem' }}>
              {getCompanyName(user?.tenantId)}
            </div>
            <code style={{ fontSize: '0.875rem', backgroundColor: '#F1F5F9', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>
              {user?.tenantId}
            </code>
          </div>

          <div style={{ padding: '1.5rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Session Identity
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1E293B', marginTop: '0.5rem' }}>
              {user?.userId}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#475569', marginTop: '0.5rem' }}>
              Role: <strong>{user?.role}</strong>
            </div>
          </div>

          <div style={{ padding: '1.5rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Database Isolation Status
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#166534', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '10px', height: '10px', backgroundColor: '#22C55E', borderRadius: '50%' }}></span>
              Isolated Connection Active
            </div>
            <div style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '0.5rem' }}>
              Tenant-dedicated Mongoose instance
            </div>
          </div>
        </div>

        <div style={{ padding: '1.5rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
          <h2 style={{ fontSize: '1.125rem', marginTop: 0, color: '#1E293B' }}>System Status Overview</h2>
          <p style={{ color: '#64748B', fontSize: '0.875rem', margin: 0 }}>
            Dynamic database routing foundation active. All incoming requests are authenticated via RS256 JWT signatures and mapped exclusively to tenant-dedicated connection pools.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;

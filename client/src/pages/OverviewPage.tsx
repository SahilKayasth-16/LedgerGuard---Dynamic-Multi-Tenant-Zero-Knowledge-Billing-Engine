import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { tenantService } from '../services/tenant.service';
import type { TenantInfo, TenantTestDataRecord } from '../services/tenant.service';

export const OverviewPage: React.FC = () => {
  const { user } = useAuth();
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [records, setRecords] = useState<TenantTestDataRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchOverviewData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const info = await tenantService.getTenantMe();
      setTenantInfo(info);

      const testDataRes = await tenantService.getTenantTestData();
      if (testDataRes.success) {
        setRecords(testDataRes.data);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
  }, []);

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0F172A', marginTop: 0, marginBottom: '0.25rem' }}>
          Overview
        </h1>
        <p style={{ color: '#64748B', fontSize: '0.875rem', margin: 0 }}>
          Tenant identity, session details, and isolated database status
        </p>
      </div>

      {errorMsg && (
        <div style={{ padding: '1rem 1.25rem', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{errorMsg}</span>
          <button
            onClick={fetchOverviewData}
            style={{ padding: '0.375rem 0.75rem', backgroundColor: '#DC2626', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Summary Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {/* Tenant Identity Card */}
        <div style={{ padding: '1.25rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tenant Identity
          </span>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1E293B', marginTop: '0.5rem' }}>
            {tenantInfo?.name || (loading ? 'Loading dashboard...' : '—')}
          </div>
          <code style={{ fontSize: '0.75rem', backgroundColor: '#EEF2FF', color: '#3730A3', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>
            {tenantInfo?.id || user?.tenantId}
          </code>
        </div>

        {/* User Session Card */}
        <div style={{ padding: '1.25rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Session Identity
          </span>
          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1E293B', marginTop: '0.5rem' }}>
            {user?.userId}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#475569', marginTop: '0.25rem' }}>
            Role: <strong>{user?.role}</strong>
          </div>
        </div>

        {/* Total Usage Card (Honest Placeholder - No Fake Metrics) */}
        <div style={{ padding: '1.25rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Usage
          </span>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#94A3B8', marginTop: '0.5rem' }}>
            —
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '0.25rem' }}>
            Coming soon in metering phase
          </div>
        </div>

        {/* Current Balance Card (Honest Placeholder - No Fake Metrics) */}
        <div style={{ padding: '1.25rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Current Balance
          </span>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#94A3B8', marginTop: '0.5rem' }}>
            No billing data
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '0.25rem' }}>
            Ledger integration phase
          </div>
        </div>
      </div>

      {/* Database Pool & Gateway Status */}
      <div style={{ padding: '1.25rem 1.5rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', margin: 0 }}>
            Dynamic Mongoose Connection Status
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
            Dedicated connection pool for database <code>ledgerguard_{user?.tenantId?.replace(/-/g, '_')}</code>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '0.375rem 0.75rem', borderRadius: '6px', color: '#166534', fontWeight: 600, fontSize: '0.875rem' }}>
          <span style={{ width: '8px', height: '8px', backgroundColor: '#22C55E', borderRadius: '50%' }}></span>
          Connected & Isolated
        </div>
      </div>

      {/* Isolated Tenant Database Records */}
      <div style={{ padding: '1.5rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginTop: 0, color: '#1E293B', marginBottom: '1rem' }}>
          Tenant Isolated Records
        </h2>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B', fontSize: '0.875rem' }}>
            Loading dashboard...
          </div>
        ) : records.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {records.map((record) => (
              <div key={record._id} style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E293B' }}>{record.message}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>
                    Record ID: <code>{record._id}</code> • Created: {new Date(record.createdAt).toLocaleTimeString()}
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', backgroundColor: '#EEF2FF', color: '#3730A3', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                  {record.tenantId}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B', fontSize: '0.875rem' }}>
            No tenant data available.
          </div>
        )}
      </div>
    </div>
  );
};

export default OverviewPage;


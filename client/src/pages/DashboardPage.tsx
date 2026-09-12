import React, { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../hooks/useAuth';
import { tenantService } from '../services/tenant.service';
import type { TenantInfo, TenantTestDataRecord } from '../services/tenant.service';

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [records, setRecords] = useState<TenantTestDataRecord[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchTenantData = async () => {
      setLoadingData(true);
      setErrorMsg(null);
      try {
        const info = await tenantService.getTenantMe();
        setTenantInfo(info);

        const testDataRes = await tenantService.getTenantTestData();
        if (testDataRes.success) {
          setRecords(testDataRes.data);
        }
      } catch (err: any) {
        setErrorMsg(err.response?.data?.message || err.message || 'Failed to load backend tenant data');
      } finally {
        setLoadingData(false);
      }
    };

    fetchTenantData();
  }, []);

  return (
    <DashboardLayout>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.75rem', color: '#0F172A', marginTop: 0, marginBottom: '0.5rem' }}>
          LedgerGuard Gateway Overview
        </h1>
        <p style={{ color: '#64748B', marginBottom: '2rem' }}>
          Dynamic Multi-Tenant Zero-Knowledge Billing Engine — Week 1 Integration Complete
        </p>

        {errorMsg && (
          <div style={{ padding: '1rem', backgroundColor: '#FEE2E2', color: '#DC2626', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ padding: '1.5rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Backend Tenant Context
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1E293B', marginTop: '0.5rem' }}>
              {tenantInfo?.name || 'Loading backend tenant...'}
            </div>
            <code style={{ fontSize: '0.875rem', backgroundColor: '#EEF2FF', color: '#3730A3', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>
              {tenantInfo?.id || user?.tenantId}
            </code>
          </div>

          <div style={{ padding: '1.5rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Verified User Session
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
              API Gateway Isolation
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#166534', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '10px', height: '10px', backgroundColor: '#22C55E', borderRadius: '50%' }}></span>
              Tenant Gateway Active
            </div>
            <div style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '0.5rem' }}>
              Status: <strong>{tenantInfo?.status || 'Active'}</strong>
            </div>
          </div>
        </div>

        <div style={{ padding: '1.5rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
          <h2 style={{ fontSize: '1.125rem', marginTop: 0, color: '#1E293B' }}>Isolated Tenant Database Records</h2>
          {loadingData ? (
            <p style={{ color: '#64748B', fontSize: '0.875rem' }}>Fetching tenant-isolated Mongoose records...</p>
          ) : records.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              {records.map((rec) => (
                <div key={rec._id} style={{ padding: '0.75rem 1rem', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>{rec.message}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                    Tenant DB: <code>{rec.tenantId}</code> • Record ID: {rec._id}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#64748B', fontSize: '0.875rem' }}>No database records found for this tenant pool.</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;

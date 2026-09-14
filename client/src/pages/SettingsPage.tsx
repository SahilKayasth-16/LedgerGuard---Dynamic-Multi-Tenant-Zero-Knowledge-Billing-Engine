import React from 'react';
import { useAuth } from '../hooks/useAuth';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0F172A', marginTop: 0, marginBottom: '0.25rem' }}>
          Tenant Settings
        </h1>
        <p style={{ color: '#64748B', fontSize: '0.875rem', margin: 0 }}>
          Configuration and security preferences for {user?.tenantId}
        </p>
      </div>

      <div style={{ padding: '2rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1E293B', marginTop: 0, marginBottom: '1rem' }}>
          Tenant Security & Configuration
        </h2>

        <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>Cryptographic Key Architecture</div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>
            RS256 Asymmetric Signing • Public Key Signature Verification Active
          </div>
        </div>

        <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>Database Pool Isolation</div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>
            Tenant DB Pool: <code>ledgerguard_{user?.tenantId?.replace(/-/g, '_')}</code>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;


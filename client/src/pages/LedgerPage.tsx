import React from 'react';

export const LedgerPage: React.FC = () => {
  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0F172A', marginTop: 0, marginBottom: '0.25rem' }}>
          Billing Ledger
        </h1>
        <p style={{ color: '#64748B', fontSize: '0.875rem', margin: 0 }}>
          Immutable tenant billing transaction ledger
        </p>
      </div>

      <div style={{ padding: '3rem 2rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', padding: '0.75rem 1.25rem', backgroundColor: '#EEF2FF', color: '#4F46E5', borderRadius: '20px', fontWeight: 600, fontSize: '0.875rem', marginBottom: '1rem' }}>
          Coming Soon
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1E293B', marginTop: 0, marginBottom: '0.5rem' }}>
          Billing Ledger Module
        </h2>
        <p style={{ color: '#64748B', fontSize: '0.875rem', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
          Immutable billing transaction records, zero-knowledge proofs, and tenant ledger writes will be introduced in a future development phase.
        </p>
      </div>
    </div>
  );
};

export default LedgerPage;


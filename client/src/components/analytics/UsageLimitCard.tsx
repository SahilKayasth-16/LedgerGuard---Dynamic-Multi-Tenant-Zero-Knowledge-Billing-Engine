import React from 'react';
import type { LimitsMetrics } from '../../services/analytics.service';

interface UsageLimitCardProps {
  limits: LimitsMetrics | null;
  loading: boolean;
}

export const UsageLimitCard: React.FC<UsageLimitCardProps> = ({ limits, loading }) => {
  return (
    <div
      style={{
        padding: '1.5rem',
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', margin: 0 }}>
          Resource Usage Limits
        </h3>
        <span
          style={{
            fontSize: '0.6875rem',
            padding: '0.15rem 0.4rem',
            backgroundColor: '#F3E8FF',
            color: '#6B21A8',
            borderRadius: '4px',
            fontWeight: 600,
          }}
        >
          Tenant Configuration
        </span>
      </div>

      {loading ? (
        <div
          style={{
            height: '180px',
            backgroundColor: '#F8FAFC',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid #CBD5E1',
              borderTopColor: '#9333EA',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
      ) : (
        <div
          style={{
            padding: '1.25rem',
            backgroundColor: '#FAF5FF',
            borderRadius: '6px',
            border: '1px solid #E9D5FF',
            color: '#581C87',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.375rem' }}>
            Limits Not Configured
          </div>
          <p style={{ fontSize: '0.8125rem', margin: 0, lineHeight: 1.5 }}>
            {limits?.message || 'Usage limits are not configured for this tenant.'}
          </p>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import type { BreakdownMetrics } from '../../services/analytics.service';

interface CostBreakdownCardProps {
  breakdown: BreakdownMetrics | null;
  loading: boolean;
}

export const CostBreakdownCard: React.FC<CostBreakdownCardProps> = ({ breakdown, loading }) => {
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
          Resource / Cost Breakdown
        </h3>
        <span
          style={{
            fontSize: '0.6875rem',
            padding: '0.15rem 0.4rem',
            backgroundColor: '#FEF3C7',
            color: '#92400E',
            borderRadius: '4px',
            fontWeight: 600,
          }}
        >
          Schema Limitation
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
              borderTopColor: '#D97706',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
      ) : (
        <div
          style={{
            padding: '1.25rem',
            backgroundColor: '#FFFBEB',
            borderRadius: '6px',
            border: '1px solid #FDE68A',
            color: '#78350F',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.375rem' }}>
            Category Breakdown Unavailable
          </div>
          <p style={{ fontSize: '0.8125rem', margin: 0, lineHeight: 1.5 }}>
            {breakdown?.message ||
              "Resource/category cost breakdown is unavailable because 'category' is not defined on the LedgerEntry schema."}
          </p>
        </div>
      )}
    </div>
  );
};

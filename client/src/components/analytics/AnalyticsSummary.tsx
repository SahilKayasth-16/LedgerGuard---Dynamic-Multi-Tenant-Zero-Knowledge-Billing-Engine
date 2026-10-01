import React from 'react';
import type { SummaryMetrics } from '../../services/analytics.service';

interface AnalyticsSummaryProps {
  summary: SummaryMetrics | null;
  loading: boolean;
}

export const AnalyticsSummary: React.FC<AnalyticsSummaryProps> = ({ summary, loading }) => {
  const formatCurrency = (val: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const renderSkeleton = () => (
    <div
      style={{
        height: '32px',
        width: '100px',
        backgroundColor: '#E2E8F0',
        borderRadius: '4px',
        marginTop: '0.75rem',
        animation: 'pulse 1.5s infinite ease-in-out',
      }}
    />
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: '1.25rem',
        marginBottom: '2rem',
      }}
    >
      {/* Card 1: Total Expenditure */}
      <div
        style={{
          padding: '1.25rem',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#64748B',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Total Expenditure
          </span>
          <span
            style={{
              fontSize: '0.6875rem',
              padding: '0.15rem 0.4rem',
              backgroundColor: '#EFF6FF',
              color: '#1D4ED8',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            Real Aggregation
          </span>
        </div>
        {loading ? (
          renderSkeleton()
        ) : (
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0F172A', marginTop: '0.75rem' }}>
            {formatCurrency(summary?.totalExpenditure || 0, summary?.currency)}
          </div>
        )}
        <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem', marginBottom: 0 }}>
          Sum of completed debits in selected period
        </p>
      </div>

      {/* Card 2: Total Transactions */}
      <div
        style={{
          padding: '1.25rem',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#64748B',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Total Transactions
          </span>
          <span
            style={{
              fontSize: '0.6875rem',
              padding: '0.15rem 0.4rem',
              backgroundColor: '#F1F5F9',
              color: '#475569',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            Volume
          </span>
        </div>
        {loading ? (
          renderSkeleton()
        ) : (
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0F172A', marginTop: '0.75rem' }}>
            {(summary?.totalTransactions || 0).toLocaleString()}
          </div>
        )}
        <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem', marginBottom: 0 }}>
          Total processed events in range
        </p>
      </div>

      {/* Card 3: Successful Transactions */}
      <div
        style={{
          padding: '1.25rem',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#64748B',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Successful Transactions
          </span>
          <span
            style={{
              fontSize: '0.6875rem',
              padding: '0.15rem 0.4rem',
              backgroundColor: '#F0FDF4',
              color: '#15803D',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            Completed
          </span>
        </div>
        {loading ? (
          renderSkeleton()
        ) : (
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#166534', marginTop: '0.75rem' }}>
            {(summary?.successfulTransactions || 0).toLocaleString()}
          </div>
        )}
        <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem', marginBottom: 0 }}>
          Successfully committed ledger records
        </p>
      </div>

      {/* Card 4: Failed Transactions */}
      <div
        style={{
          padding: '1.25rem',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#64748B',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Failed Transactions
          </span>
          <span
            style={{
              fontSize: '0.6875rem',
              padding: '0.15rem 0.4rem',
              backgroundColor: '#FEF2F2',
              color: '#B91C1C',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            Failed
          </span>
        </div>
        {loading ? (
          renderSkeleton()
        ) : (
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#991B1B', marginTop: '0.75rem' }}>
            {(summary?.failedTransactions || 0).toLocaleString()}
          </div>
        )}
        <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem', marginBottom: 0 }}>
          Failed or aborted ledger events
        </p>
      </div>
    </div>
  );
};

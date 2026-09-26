import React, { useState } from 'react';

type TimeRangeOption = '7d' | '30d' | '90d' | 'custom';

export const AnalyticsPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('30d');

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', paddingBottom: '2rem' }}>
      {/* Header & Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: '#0F172A',
              marginTop: 0,
              marginBottom: '0.25rem',
            }}
          >
            Usage & Financial Analytics
          </h1>
          <p style={{ color: '#64748B', fontSize: '0.875rem', margin: 0 }}>
            Real-time billing metrics, transaction trends, and expenditure analysis
          </p>
        </div>

        {/* Time Range Selector */}
        <div
          style={{
            display: 'inline-flex',
            backgroundColor: '#F1F5F9',
            padding: '4px',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
          }}
        >
          {(['7d', '30d', '90d', 'custom'] as TimeRangeOption[]).map((range) => {
            const isActive = timeRange === range;
            const labels: Record<TimeRangeOption, string> = {
              '7d': '7 Days',
              '30d': '30 Days',
              '90d': '90 Days',
              custom: 'Custom Range',
            };
            return (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                style={{
                  padding: '0.375rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#0F172A' : '#64748B',
                  backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {labels[range]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Metric Cards Grid */}
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
              Day 16 Pipeline
            </span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#94A3B8', marginTop: '0.75rem' }}>
            --
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem', marginBottom: 0 }}>
            Contract Defined — Backend Query Pending (Day 16)
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
                backgroundColor: '#EFF6FF',
                color: '#1D4ED8',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              Day 16 Pipeline
            </span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#94A3B8', marginTop: '0.75rem' }}>
            --
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem', marginBottom: 0 }}>
            Contract Defined — Backend Query Pending (Day 16)
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
              Successful Expenditure
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
              Day 16 Pipeline
            </span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#94A3B8', marginTop: '0.75rem' }}>
            --
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem', marginBottom: 0 }}>
            Contract Defined — Backend Query Pending (Day 16)
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
              Day 16 Pipeline
            </span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#94A3B8', marginTop: '0.75rem' }}>
            --
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem', marginBottom: 0 }}>
            Contract Defined — Backend Query Pending (Day 16)
          </p>
        </div>
      </div>

      {/* Reserved Visualization Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        {/* Expenditure Trend Visualization Area */}
        <div
          style={{
            padding: '1.5rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', margin: 0 }}>
              Expenditure Trend over Time ({timeRange.toUpperCase()})
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
              Daily aggregation of completed debits
            </p>
          </div>
          <div
            style={{
              height: '220px',
              backgroundColor: '#F8FAFC',
              borderRadius: '6px',
              border: '1px dashed #CBD5E1',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '1rem',
            }}
          >
            <div
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#475569',
                backgroundColor: '#F1F5F9',
                padding: '0.375rem 0.75rem',
                borderRadius: '16px',
                marginBottom: '0.5rem',
              }}
            >
              Chart.js Visualization Area
            </div>
            <p style={{ fontSize: '0.75rem', color: '#64748B', maxWidth: '340px', margin: 0 }}>
              MongoDB aggregation pipeline will be implemented in Day 16. Chart renderers added in Day 18.
            </p>
          </div>
        </div>

        {/* Transaction Distribution Visualization Area */}
        <div
          style={{
            padding: '1.5rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', margin: 0 }}>
              Transaction Distribution by Type
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
              Committed volume ratio (Debits vs Credits)
            </p>
          </div>
          <div
            style={{
              height: '220px',
              backgroundColor: '#F8FAFC',
              borderRadius: '6px',
              border: '1px dashed #CBD5E1',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '1rem',
            }}
          >
            <div
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#475569',
                backgroundColor: '#F1F5F9',
                padding: '0.375rem 0.75rem',
                borderRadius: '16px',
                marginBottom: '0.5rem',
              }}
            >
              Breakdown Chart Area
            </div>
            <p style={{ fontSize: '0.75rem', color: '#64748B', maxWidth: '340px', margin: 0 }}>
              Breakdown & grouping pipelines will be implemented in Day 17. Chart renderers added in Day 18.
            </p>
          </div>
        </div>
      </div>

      {/* Contract & Schema Limitations Notice */}
      <div
        style={{
          padding: '1.25rem 1.5rem',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
        }}
      >
        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginTop: 0, marginBottom: '0.5rem' }}>
          Analytics Contract & Domain Boundaries (Day 15)
        </h4>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#64748B', fontSize: '0.8125rem', lineHeight: '1.6' }}>
          <li>
            <strong>Data Authority:</strong> Metrics are strictly calculated from committed ledger entries (<code>status: 'completed'</code>) isolated per tenant.
          </li>
          <li>
            <strong>Schema Limitations Documented:</strong> Resource-level spending categories and tenant budget limits are documented as schema limitations in <code>docs/analytics-metrics.md</code>.
          </li>
          <li>
            <strong>Security Invariant:</strong> Tenant isolation is strictly enforced via JWT authentication context.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default AnalyticsPage;

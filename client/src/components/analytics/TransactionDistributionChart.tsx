import React from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import type { SummaryMetrics } from '../../services/analytics.service';

ChartJS.register(ArcElement, Tooltip, Legend);

interface TransactionDistributionChartProps {
  summary: SummaryMetrics | null;
  loading: boolean;
  timeRangeLabel: string;
}

export const TransactionDistributionChart: React.FC<TransactionDistributionChartProps> = ({
  summary,
  loading,
  timeRangeLabel,
}) => {
  if (loading) {
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
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', margin: 0 }}>
            Transaction Distribution by Status ({timeRangeLabel})
          </h3>
          <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
            Committed vs failed transaction volume
          </p>
        </div>
        <div
          style={{
            height: '240px',
            backgroundColor: '#F8FAFC',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3px solid #CBD5E1',
              borderTopColor: '#4F46E5',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <span style={{ fontSize: '0.8125rem', color: '#64748B', fontWeight: 500 }}>
            Calculating transaction distribution...
          </span>
        </div>
      </div>
    );
  }

  const total = summary?.totalTransactions || 0;
  const completed = summary?.successfulTransactions || 0;
  const failed = summary?.failedTransactions || 0;

  if (total === 0) {
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
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', margin: 0 }}>
              Transaction Distribution by Status ({timeRangeLabel})
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
              Real-time ratio of completed vs failed events
            </p>
          </div>
          <span
            style={{
              fontSize: '0.6875rem',
              padding: '0.2rem 0.5rem',
              backgroundColor: '#F1F5F9',
              color: '#475569',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            Chart.js Engine
          </span>
        </div>

        <div
          style={{
            height: '240px',
            backgroundColor: '#F8FAFC',
            borderRadius: '6px',
            border: '1px dashed #CBD5E1',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '1.5rem',
          }}
        >
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
            No transactions found for this period
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#64748B', maxWidth: '380px', margin: 0, lineHeight: 1.5 }}>
            No transaction records were executed within the selected timeframe ({timeRangeLabel}). Process a transaction in the Ledger to generate distribution metrics.
          </p>
        </div>
      </div>
    );
  }

  const chartData = {
    labels: ['Completed', 'Failed'],
    datasets: [
      {
        data: [completed, failed],
        backgroundColor: ['#22C55E', '#EF4444'],
        borderColor: ['#16A34A', '#DC2626'],
        borderWidth: 1,
        hoverOffset: 6,
      },
    ],
  };

  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 14,
          font: { size: 12 },
          color: '#334155',
          padding: 16,
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const val = Number(context.parsed) || 0;
            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
            return ` ${context.label}: ${val} (${pct}%)`;
          },
        },
      },
    },
    cutout: '65%',
  };

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
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', margin: 0 }}>
            Transaction Distribution by Status ({timeRangeLabel})
          </h3>
          <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
            Volume ratio of {total} processed events
          </p>
        </div>
        <span
          style={{
            fontSize: '0.6875rem',
            padding: '0.2rem 0.5rem',
            backgroundColor: '#EFF6FF',
            color: '#1D4ED8',
            borderRadius: '4px',
            fontWeight: 600,
          }}
        >
          Chart.js Engine
        </span>
      </div>

      <div style={{ height: '240px', width: '100%', position: 'relative' }}>
        <Doughnut data={chartData} options={options} />
      </div>
    </div>
  );
};

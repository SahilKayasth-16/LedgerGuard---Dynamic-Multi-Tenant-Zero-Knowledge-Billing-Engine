import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { TimeseriesMetrics } from '../../services/analytics.service';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ExpenditureChartProps {
  data: TimeseriesMetrics | null;
  loading: boolean;
  timeRangeLabel: string;
}

export const ExpenditureChart: React.FC<ExpenditureChartProps> = ({
  data,
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
            Expenditure Trend over Time ({timeRangeLabel})
          </h3>
          <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
            Daily aggregation of completed debits
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
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid #CBD5E1',
              borderTopColor: '#2563EB',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
      </div>
    );
  }

  const timeseries = data?.timeseries || [];
  const labels = timeseries.map((item) => item.date);
  const amounts = timeseries.map((item) => item.amount);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Expenditure ($)',
        data: amounts,
        borderColor: '#2563EB',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: timeseries.length > 30 ? 1.5 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: '#2563EB',
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const val = context.parsed.y || 0;
            return `Expenditure: $${val.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            size: 11,
          },
          color: '#64748B',
          maxTicksLimit: 10,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: '#F1F5F9',
        },
        ticks: {
          font: {
            size: 11,
          },
          color: '#64748B',
          callback: (value) => `$${value}`,
        },
      },
    },
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
            Expenditure Trend over Time ({timeRangeLabel})
          </h3>
          <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '0.25rem 0 0 0' }}>
            Daily aggregated expenditure computed directly via MongoDB pipeline
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

      <div style={{ height: '240px', width: '100%' }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { analyticsService } from '../services/analytics.service';
import type {
  SummaryMetrics,
  TimeseriesMetrics,
  BreakdownMetrics,
  LimitsMetrics,
} from '../services/analytics.service';
import { AnalyticsSummary } from '../components/analytics/AnalyticsSummary';
import { ExpenditureChart } from '../components/analytics/ExpenditureChart';
import { TransactionDistributionChart } from '../components/analytics/TransactionDistributionChart';
import { CostBreakdownCard } from '../components/analytics/CostBreakdownCard';
import { UsageLimitCard } from '../components/analytics/UsageLimitCard';
import { formatApiError } from '../utils/error';

export type SupportedTimeRange = '7d' | '30d' | '90d';

export const AnalyticsPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState<SupportedTimeRange>('30d');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorInfo, setErrorInfo] = useState<{ message: string; traceId?: string } | null>(null);

  const [summary, setSummary] = useState<SummaryMetrics | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesMetrics | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownMetrics | null>(null);
  const [limits, setLimits] = useState<LimitsMetrics | null>(null);

  // Ref tracking in-flight request counter to prevent stale out-of-order responses
  const requestIdRef = useRef<number>(0);

  const fetchAnalytics = useCallback(async (selectedRange: SupportedTimeRange) => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setErrorInfo(null);

    try {
      const [summaryRes, timeseriesRes, breakdownRes, limitsRes] = await Promise.all([
        analyticsService.getSummaryMetrics(selectedRange),
        analyticsService.getTimeseriesMetrics(selectedRange),
        analyticsService.getBreakdownMetrics(selectedRange),
        analyticsService.getLimitsMetrics(selectedRange),
      ]);

      // Guard against stale response if user switched range while request was in-flight
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      setSummary(summaryRes);
      setTimeseries(timeseriesRes);
      setBreakdown(breakdownRes);
      setLimits(limitsRes);
    } catch (err: any) {
      if (currentRequestId !== requestIdRef.current) {
        return;
      }
      const formatted = formatApiError(err);
      setErrorInfo(formatted);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(timeRange);
  }, [timeRange, fetchAnalytics]);

  const rangeLabels: Record<SupportedTimeRange, string> = {
    '7d': '7 Days',
    '30d': '30 Days',
    '90d': '90 Days',
  };

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

        {/* Time Range Selector (7d, 30d, 90d supported by backend) */}
        <div
          style={{
            display: 'inline-flex',
            backgroundColor: '#F1F5F9',
            padding: '4px',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
          }}
        >
          {(['7d', '30d', '90d'] as SupportedTimeRange[]).map((range) => {
            const isActive = timeRange === range;
            return (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                disabled={loading && isActive}
                style={{
                  padding: '0.375rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#0F172A' : '#64748B',
                  backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  cursor: loading && isActive ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                  opacity: loading && isActive ? 0.7 : 1,
                }}
              >
                {rangeLabels[range]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error Banner with Retry */}
      {errorInfo && (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#991B1B',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {errorInfo.message}
            </span>
            {errorInfo.traceId && (
              <div style={{ fontSize: '0.75rem', color: '#B91C1C', marginTop: '0.25rem' }}>
                Reference ID: <code>{errorInfo.traceId}</code>
              </div>
            )}
          </div>
          <button
            onClick={() => fetchAnalytics(timeRange)}
            disabled={loading}
            style={{
              padding: '0.375rem 0.75rem',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Retrying...' : 'Retry Analytics'}
          </button>
        </div>
      )}

      {/* Metric Cards Grid */}
      <AnalyticsSummary summary={summary} loading={loading} />

      {/* Real Chart.js Visualizations Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        {/* Chart 1: Expenditure Line Chart */}
        <ExpenditureChart
          data={timeseries}
          loading={loading}
          timeRangeLabel={rangeLabels[timeRange]}
        />

        {/* Chart 2: Transaction Distribution Doughnut Chart */}
        <TransactionDistributionChart
          summary={summary}
          loading={loading}
          timeRangeLabel={rangeLabels[timeRange]}
        />
      </div>

      {/* Breakdown & Limits Info Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        <CostBreakdownCard breakdown={breakdown} loading={loading} />
        <UsageLimitCard limits={limits} loading={loading} />
      </div>
    </div>
  );
};

export default AnalyticsPage;

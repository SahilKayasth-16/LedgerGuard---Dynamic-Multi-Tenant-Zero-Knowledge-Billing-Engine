import React, { useEffect, useState } from 'react';
import { ledgerService } from '../services/ledger.service';
import type { LedgerEntry } from '../services/ledger.service';

export const LedgerPage: React.FC = () => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLedgerData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ledgerService.getLedgerEntries();
      setEntries(data);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Unable to load billing ledger records. Please verify your connection or try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgerData();
  }, []);

  const getTypeBadgeStyle = (type: 'debit' | 'credit'): React.CSSProperties => {
    if (type === 'credit') {
      return {
        backgroundColor: '#DCFCE7',
        color: '#15803D',
        border: '1px solid #86EFAC',
        padding: '0.2rem 0.5rem',
        borderRadius: '4px',
        fontWeight: 600,
        fontSize: '0.75rem',
        textTransform: 'uppercase',
      };
    }
    return {
      backgroundColor: '#FEF2F2',
      color: '#B91C1C',
      border: '1px solid #FCA5A5',
      padding: '0.2rem 0.5rem',
      borderRadius: '4px',
      fontWeight: 600,
      fontSize: '0.75rem',
      textTransform: 'uppercase',
    };
  };

  const getStatusBadgeStyle = (status: string): React.CSSProperties => {
    if (status === 'completed') {
      return {
        backgroundColor: '#F0FDF4',
        color: '#166534',
        border: '1px solid #86EFAC',
        padding: '0.2rem 0.5rem',
        borderRadius: '4px',
        fontWeight: 500,
        fontSize: '0.75rem',
      };
    }
    if (status === 'failed') {
      return {
        backgroundColor: '#FEF2F2',
        color: '#991B1B',
        border: '1px solid #FCA5A5',
        padding: '0.2rem 0.5rem',
        borderRadius: '4px',
        fontWeight: 500,
        fontSize: '0.75rem',
      };
    }
    // pending
    return {
      backgroundColor: '#FEF3C7',
      color: '#92400E',
      border: '1px solid #FDE68A',
      padding: '0.2rem 0.5rem',
      borderRadius: '4px',
      fontWeight: 500,
      fontSize: '0.75rem',
    };
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
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
            Billing Ledger
          </h1>
          <p style={{ color: '#64748B', fontSize: '0.875rem', margin: 0 }}>
            Tenant-isolated financial transaction records
          </p>
        </div>

        <button
          onClick={fetchLedgerData}
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#FFFFFF',
            color: '#334155',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s ease',
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh Records'}
        </button>
      </div>

      {/* STATE 1: LOADING */}
      {loading && (
        <div
          style={{
            padding: '3rem 2rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            textAlign: 'center',
            color: '#64748B',
            fontSize: '0.875rem',
          }}
        >
          Fetching tenant ledger records...
        </div>
      )}

      {/* STATE 2: ERROR */}
      {!loading && error && (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#991B1B',
            borderRadius: '8px',
            fontSize: '0.875rem',
            marginBottom: '1.5rem',
          }}
        >
          <strong>Error Loading Ledger:</strong> {error}
        </div>
      )}

      {/* STATE 3: EMPTY */}
      {!loading && !error && entries.length === 0 && (
        <div
          style={{
            padding: '3rem 2rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#334155',
              marginBottom: '0.5rem',
            }}
          >
            No Ledger Records Found
          </div>
          <p
            style={{
              color: '#64748B',
              fontSize: '0.875rem',
              maxWidth: '460px',
              margin: '0 auto',
            }}
          >
            There are no financial billing ledger records for your tenant organization yet. New ledger events will appear here.
          </p>
        </div>
      )}

      {/* STATE 4: SUCCESS / TABLE */}
      {!loading && !error && entries.length > 0 && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr
                style={{
                  backgroundColor: '#F8FAFC',
                  borderBottom: '1px solid #E2E8F0',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <th style={{ padding: '0.75rem 1rem' }}>Event ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                <th style={{ padding: '0.75rem 1rem' }}>Currency</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  style={{
                    borderBottom: '1px solid #F1F5F9',
                    fontSize: '0.875rem',
                    color: '#1E293B',
                  }}
                >
                  <td style={{ padding: '0.875rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>
                    {entry.eventId}
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <span style={getTypeBadgeStyle(entry.type)}>{entry.type}</span>
                  </td>
                  <td
                    style={{
                      padding: '0.875rem 1rem',
                      fontWeight: 600,
                      color: entry.type === 'credit' ? '#15803D' : '#0F172A',
                    }}
                  >
                    {entry.type === 'debit' ? '-' : '+'}
                    {entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', fontWeight: 500, color: '#475569' }}>
                    {entry.currency}
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <span style={getStatusBadgeStyle(entry.status)}>{entry.status}</span>
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748B' }}>
                    {entry.description || '—'}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                    {formatDate(entry.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LedgerPage;

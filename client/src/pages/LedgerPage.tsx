import React, { useEffect, useState } from 'react';
import { ledgerService } from '../services/ledger.service';
import type { LedgerEntry } from '../services/ledger.service';
import { Notification } from '../components/Notification';
import { useNotification } from '../context/NotificationContext';

export const LedgerPage: React.FC = () => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Quick transaction test state
  const [showQuickForm, setShowQuickForm] = useState<boolean>(false);
  const [testEventId, setTestEventId] = useState<string>('');
  const [testType, setTestType] = useState<'debit' | 'credit'>('debit');
  const [testAmount, setTestAmount] = useState<string>('299');
  const [testDescription, setTestDescription] = useState<string>('');
  const [submittingTx, setSubmittingTx] = useState<boolean>(false);

  const { showSuccess, showDuplicate, showError, setSubmitting, clearNotification } = useNotification();

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

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEventId.trim()) {
      showError('Please provide an event ID.');
      return;
    }

    const numAmount = parseFloat(testAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showError('Amount must be a positive number.');
      return;
    }

    setSubmittingTx(true);
    setSubmitting('Processing transaction with idempotency verification...');

    try {
      const response = await ledgerService.createLedgerEntry({
        eventId: testEventId.trim(),
        type: testType,
        amount: numAmount,
        currency: 'INR',
        description: testDescription.trim() || undefined,
      });

      if (response.duplicate) {
        showDuplicate('This billing event has already been processed.');
      } else {
        showSuccess('Ledger transaction created successfully.');
        setTestDescription('');
      }

      await fetchLedgerData();
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.message || 'Unable to process the transaction. Please try again.';
      showError(errorMsg);
    } finally {
      setSubmittingTx(false);
    }
  };

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
            Tenant-isolated financial transaction records with idempotency guarantees
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => {
              clearNotification();
              setShowQuickForm(!showQuickForm);
            }}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: showQuickForm ? '#F1F5F9' : '#4F46E5',
              color: showQuickForm ? '#334155' : '#FFFFFF',
              border: showQuickForm ? '1px solid #CBD5E1' : 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {showQuickForm ? 'Hide Submit Form' : '+ Test Idempotent Transaction'}
          </button>

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
      </div>

      {/* REUSABLE NOTIFICATION BANNER */}
      <Notification />

      {/* QUICK TRANSACTION TEST FORM */}
      {showQuickForm && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', marginTop: 0, marginBottom: '1rem' }}>
            Submit Test Billing Event (Idempotency Demo)
          </h2>
          <form onSubmit={handleQuickSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                Event ID (Unique Per Tenant)
              </label>
              <input
                type="text"
                value={testEventId}
                onChange={(e) => setTestEventId(e.target.value)}
                placeholder="e.g. inv_march_001"
                disabled={submittingTx}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ width: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                Type
              </label>
              <select
                value={testType}
                onChange={(e) => setTestType(e.target.value as 'debit' | 'credit')}
                disabled={submittingTx}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  backgroundColor: '#FFFFFF',
                  boxSizing: 'border-box',
                }}
              >
                <option value="debit">DEBIT</option>
                <option value="credit">CREDIT</option>
              </select>
            </div>

            <div style={{ width: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                Amount (INR)
              </label>
              <input
                type="number"
                value={testAmount}
                onChange={(e) => setTestAmount(e.target.value)}
                disabled={submittingTx}
                min="0.01"
                step="0.01"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                Description (Optional)
              </label>
              <input
                type="text"
                value={testDescription}
                onChange={(e) => setTestDescription(e.target.value)}
                placeholder="e.g. Cloud Compute Charge"
                disabled={submittingTx}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={submittingTx}
                style={{
                  padding: '0.55rem 1.25rem',
                  backgroundColor: submittingTx ? '#94A3B8' : '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: submittingTx ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {submittingTx ? 'Submitting...' : 'Submit Transaction'}
              </button>
            </div>
          </form>
          <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.75rem', color: '#64748B' }}>
            Tip: Submit once with an Event ID to create it. Submit again with the exact same Event ID to witness idempotency in action!
          </p>
        </div>
      )}

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

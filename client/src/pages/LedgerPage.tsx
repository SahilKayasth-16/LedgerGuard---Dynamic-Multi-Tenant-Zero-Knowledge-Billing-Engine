import React, { useEffect, useState } from 'react';
import { ledgerService } from '../services/ledger.service';
import type { LedgerEntry } from '../services/ledger.service';
import { Notification } from '../components/Notification';
import { useNotification } from '../context/NotificationContext';

export const LedgerPage: React.FC = () => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Quick transaction creation state
  const [showQuickForm, setShowQuickForm] = useState<boolean>(false);
  const [testEventId, setTestEventId] = useState<string>('');
  const [testType, setTestType] = useState<'debit' | 'credit'>('debit');
  const [testAmount, setTestAmount] = useState<string>('299');
  const [testCurrency, setTestCurrency] = useState<string>('INR');
  const [testDescription, setTestDescription] = useState<string>('');
  const [submittingTx, setSubmittingTx] = useState<boolean>(false);

  // Transaction detail modal state
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);

  const { showSuccess, showDuplicate, showContention, showError, setSubmitting, clearNotification } = useNotification();

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

    const trimmedEventId = testEventId.trim();
    if (!trimmedEventId) {
      showError('Please provide a unique Event ID (Idempotency Key).');
      return;
    }

    const numAmount = parseFloat(testAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showError('Amount must be a positive number greater than zero.');
      return;
    }

    const trimmedCurrency = testCurrency.trim().toUpperCase();
    if (trimmedCurrency.length !== 3 || !/^[A-Z]{3}$/.test(trimmedCurrency)) {
      showError('Currency must be a valid 3-letter code (e.g. INR, USD, EUR).');
      return;
    }

    setSubmittingTx(true);
    setSubmitting('Processing transaction with Redis lock & MongoDB ACID verification...');

    try {
      const response = await ledgerService.createLedgerEntry({
        eventId: trimmedEventId,
        type: testType,
        amount: numAmount,
        currency: trimmedCurrency,
        description: testDescription.trim() || undefined,
      });

      if (response.duplicate) {
        showDuplicate('This billing event has already been processed. No duplicate transaction was created.');
      } else {
        showSuccess('Ledger transaction committed successfully.');
        setTestDescription('');
      }

      await fetchLedgerData();
    } catch (err: any) {
      if (err.response?.status === 409 || err.response?.data?.code === 'EVENT_PROCESSING') {
        showContention(
          err.response?.data?.message || 'This event is currently being processed. Please try again shortly.'
        );
      } else if (err.response?.status === 503 || err.response?.data?.code === 'REDIS_UNAVAILABLE') {
        showError(err.response?.data?.message || 'Ledger processing is temporarily unavailable.');
      } else {
        const errorMsg =
          err.response?.data?.message || 'Unable to process the transaction. Please try again.';
        showError(errorMsg);
      }
    } finally {
      setSubmittingTx(false);
    }
  };

  const formatCurrencyAmount = (amount: number, currencyCode: string) => {
    try {
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode.toUpperCase(),
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return formatter.format(amount);
    } catch {
      return `${currencyCode.toUpperCase()} ${amount.toFixed(2)}`;
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(d);
    } catch {
      return dateStr;
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
        fontWeight: 600,
        fontSize: '0.75rem',
        textTransform: 'capitalize',
      };
    }
    if (status === 'failed') {
      return {
        backgroundColor: '#FEF2F2',
        color: '#991B1B',
        border: '1px solid #FCA5A5',
        padding: '0.2rem 0.5rem',
        borderRadius: '4px',
        fontWeight: 600,
        fontSize: '0.75rem',
        textTransform: 'capitalize',
      };
    }
    // pending / processing
    return {
      backgroundColor: '#FEF3C7',
      color: '#92400E',
      border: '1px solid #FDE68A',
      padding: '0.2rem 0.5rem',
      borderRadius: '4px',
      fontWeight: 600,
      fontSize: '0.75rem',
      textTransform: 'capitalize',
    };
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      {/* PAGE HEADER */}
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
            Real-time financial transaction records backed by tenant-isolated MongoDB transactions
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
            {showQuickForm ? 'Hide Form' : '+ Create Transaction'}
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

      {/* NOTIFICATION BANNER */}
      <Notification />

      {/* CREATE TRANSACTION FORM PANEL */}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', margin: 0 }}>
              Submit Billing Event
            </h2>
            <span style={{ fontSize: '0.75rem', color: '#64748B', backgroundColor: '#F8FAFC', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
              Idempotency Enabled
            </span>
          </div>

          <form onSubmit={handleQuickSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                Event ID (Idempotency Key) *
              </label>
              <input
                type="text"
                value={testEventId}
                onChange={(e) => setTestEventId(e.target.value)}
                placeholder="e.g. evt_march_001"
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
              <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginTop: '0.25rem' }}>
                Unique key used to prevent duplicate billing processing on retries.
              </span>
            </div>

            <div style={{ width: '110px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                Type *
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

            <div style={{ width: '110px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                Amount *
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

            <div style={{ width: '90px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                Currency *
              </label>
              <select
                value={testCurrency}
                onChange={(e) => setTestCurrency(e.target.value)}
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
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>

            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                Description (Optional)
              </label>
              <input
                type="text"
                value={testDescription}
                onChange={(e) => setTestDescription(e.target.value)}
                placeholder="e.g. Cloud Compute Services"
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
                {submittingTx ? 'Processing...' : 'Submit Transaction'}
              </button>
            </div>
          </form>
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
          Fetching tenant ledger records from MongoDB...
        </div>
      )}

      {/* STATE 2: ERROR STATE WITH RETRY ACTION */}
      {!loading && error && (
        <div
          style={{
            padding: '1.5rem',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: '#991B1B', marginBottom: '0.25rem' }}>
              Failed to load billing ledger transactions
            </div>
            <div style={{ color: '#B91C1C', fontSize: '0.875rem' }}>{error}</div>
          </div>
          <button
            onClick={fetchLedgerData}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#991B1B',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry Loading Records
          </button>
        </div>
      )}

      {/* STATE 3: EMPTY STATE */}
      {!loading && !error && entries.length === 0 && (
        <div
          style={{
            padding: '3.5rem 2rem',
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
            No Transactions Found
          </div>
          <p
            style={{
              color: '#64748B',
              fontSize: '0.875rem',
              maxWidth: '460px',
              margin: '0 auto 1.5rem auto',
            }}
          >
            Your billing transaction history will appear here once events are processed by your tenant database.
          </p>
          <button
            onClick={() => {
              clearNotification();
              setShowQuickForm(true);
            }}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#4F46E5',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Create Your First Transaction
          </button>
        </div>
      )}

      {/* STATE 4: REAL DATA TABLE */}
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
          <div style={{ overflowX: 'auto' }}>
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
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      fontSize: '0.875rem',
                      color: '#1E293B',
                      cursor: 'pointer',
                      transition: 'background-color 0.1s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
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
                      {formatCurrencyAmount(entry.amount, entry.currency)}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span style={getStatusBadgeStyle(entry.status)}>{entry.status}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: '#64748B' }}>
                      {entry.description || '—'}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEntry(entry);
                        }}
                        style={{
                          padding: '0.25rem 0.6rem',
                          backgroundColor: '#F1F5F9',
                          color: '#475569',
                          border: '1px solid #CBD5E1',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRANSACTION DETAILS MODAL */}
      {selectedEntry && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setSelectedEntry(null)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#0F172A' }}>
                Transaction Details
              </h3>
              <button
                onClick={() => setSelectedEntry(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748B' }}>Event ID (Idempotency Key):</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F172A' }}>{selectedEntry.eventId}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748B' }}>Tenant ID:</span>
                <span style={{ fontFamily: 'monospace', color: '#475569' }}>{selectedEntry.tenantId}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748B' }}>Type:</span>
                <span style={getTypeBadgeStyle(selectedEntry.type)}>{selectedEntry.type}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748B' }}>Formatted Amount:</span>
                <span style={{ fontWeight: 700, color: selectedEntry.type === 'credit' ? '#15803D' : '#0F172A' }}>
                  {formatCurrencyAmount(selectedEntry.amount, selectedEntry.currency)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748B' }}>Status:</span>
                <span style={getStatusBadgeStyle(selectedEntry.status)}>{selectedEntry.status}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748B' }}>Description:</span>
                <span style={{ color: '#334155' }}>{selectedEntry.description || '—'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748B' }}>Created At:</span>
                <span style={{ color: '#334155' }}>{formatDateTime(selectedEntry.createdAt)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Metadata:</span>
                <pre style={{ margin: 0, fontSize: '0.75rem', backgroundColor: '#F8FAFC', padding: '0.5rem', borderRadius: '4px', border: '1px solid #E2E8F0', maxWidth: '240px', overflowX: 'auto' }}>
                  {JSON.stringify(selectedEntry.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedEntry(null)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#4F46E5',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LedgerPage;

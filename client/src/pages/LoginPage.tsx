import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error, clearError } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await login(email || 'admin@company-a.com', password);
      navigate('/dashboard/overview');
    } catch (err) {
      // Error state managed by AuthContext
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '2.5rem', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#4F46E5', margin: 0, letterSpacing: '-0.02em' }}>
            LedgerGuard
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '0.25rem' }}>
            Enterprise Zero-Knowledge Billing Engine
          </p>
        </div>

        {error && (
          <div style={{ padding: '0.75rem 1rem', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '6px', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@company-a.com"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: loading ? '#94A3B8' : '#4F46E5',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In to Tenant'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #F1F5F9', textAlign: 'center', fontSize: '0.75rem', color: '#94A3B8' }}>
          RS256 Verified Multi-Tenant Gateway
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

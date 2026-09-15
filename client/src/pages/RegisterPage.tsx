import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export const RegisterPage: React.FC = () => {
  const [orgName, setOrgName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const navigate = useNavigate();

  const handleOrgNameChange = (val: string) => {
    setOrgName(val);
    if (!tenantId || tenantId.startsWith('tenant-')) {
      const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      setTenantId(slug ? `tenant-${slug}` : '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!orgName.trim() || !tenantId.trim() || !email.trim() || !password) {
      setFormError('Please fill in all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Navigate to login with success state
      navigate('/login', {
        state: {
          successMessage: `Organization '${orgName}' registered successfully! You may now log in with your admin credentials.`,
          registeredEmail: email,
        },
      });
    } catch (err: any) {
      setFormError('Failed to register tenant organization. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '2rem 1rem',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '2.5rem',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#4F46E5', margin: 0, letterSpacing: '-0.02em' }}>
            LedgerGuard
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '0.25rem' }}>
            Register New Enterprise Tenant
          </p>
        </div>

        {formError && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FCA5A5',
              color: '#991B1B',
              borderRadius: '6px',
              marginBottom: '1.25rem',
              fontSize: '0.875rem',
            }}
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '0.375rem',
              }}
            >
              Organization Name
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => handleOrgNameChange(e.target.value)}
              placeholder="e.g. Acme Corporation"
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

          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '0.375rem',
              }}
            >
              Tenant Identifier
            </label>
            <input
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="e.g. tenant-acme-corp"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
                outline: 'none',
                backgroundColor: '#F8FAFC',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '0.375rem',
              }}
            >
              Admin Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@acme.com"
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

          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '0.375rem',
              }}
            >
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

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '0.375rem',
              }}
            >
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {loading ? 'Registering Organization...' : 'Register Tenant Organization'}
          </button>
        </form>

        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid #F1F5F9',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: '#64748B',
          }}
        >
          Already have an enterprise account?{' '}
          <Link
            to="/login"
            style={{
              color: '#4F46E5',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;


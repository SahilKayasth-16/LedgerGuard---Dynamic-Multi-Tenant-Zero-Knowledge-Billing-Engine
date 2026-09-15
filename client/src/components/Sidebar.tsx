import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export const Sidebar: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { label: 'Overview', path: '/dashboard/overview' },
    { label: 'Ledger', path: '/dashboard/ledger' },
    { label: 'Analytics', path: '/dashboard/analytics' },
    { label: 'Settings', path: '/dashboard/settings' },
  ];

  return (
    <aside
      style={{
        width: '250px',
        backgroundColor: '#0F172A',
        color: '#F8FAFC',
        minHeight: '100vh',
        padding: '1.5rem 1rem',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ paddingBottom: '1.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #1E293B' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#818CF8', margin: 0, letterSpacing: '-0.02em' }}>
            LedgerGuard
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 500 }}>
            Zero-Knowledge Billing Engine
          </span>
        </div>

        <nav>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              return (
                <li key={item.path} style={{ marginBottom: '0.375rem' }}>
                  <Link
                    to={item.path}
                    style={{
                      display: 'block',
                      padding: '0.75rem 1rem',
                      borderRadius: '6px',
                      backgroundColor: isActive ? '#3730A3' : 'transparent',
                      color: isActive ? '#FFFFFF' : '#94A3B8',
                      fontWeight: isActive ? 600 : 500,
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div style={{ padding: '1rem', backgroundColor: '#1E293B', borderRadius: '6px', fontSize: '0.75rem', color: '#94A3B8' }}>
        <div style={{ fontWeight: 600, color: '#CBD5E1', marginBottom: '0.25rem' }}>Engine Status</div>
        <div>Tenant Isolation: Active</div>
        <div>RS256 Verified</div>
      </div>
    </aside>
  );
};

export default Sidebar;

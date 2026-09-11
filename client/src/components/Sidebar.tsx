import React from 'react';

export const Sidebar: React.FC = () => {
  const navItems = [
    { label: 'Dashboard', active: true },
    { label: 'Billing', active: false },
    { label: 'Usage', active: false },
    { label: 'Transactions', active: false },
    { label: 'Settings', active: false },
  ];

  return (
    <aside style={{ width: '240px', backgroundColor: '#1E293B', color: '#F8FAFC', minHeight: '100vh', padding: '1.5rem 1rem', boxSizing: 'border-box' }}>
      <div style={{ paddingBottom: '1.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #334155' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#818CF8', margin: 0 }}>LedgerGuard</h2>
        <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Zero-Knowledge Engine</span>
      </div>

      <nav>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {navItems.map((item) => (
            <li key={item.label} style={{ marginBottom: '0.5rem' }}>
              <div
                style={{
                  display: 'block',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  backgroundColor: item.active ? '#3730A3' : 'transparent',
                  color: item.active ? '#FFFFFF' : '#94A3B8',
                  fontWeight: item.active ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                {item.label}
              </div>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;


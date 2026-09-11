import React from 'react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'sans-serif' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />
        <main style={{ flex: 1, padding: '2rem', boxSizing: 'border-box' }}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;


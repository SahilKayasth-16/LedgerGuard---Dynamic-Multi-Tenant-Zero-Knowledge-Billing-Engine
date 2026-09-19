import React from 'react';
import { useNotification } from '../context/NotificationContext';

export const Notification: React.FC = () => {
  const { notification, clearNotification } = useNotification();

  if (notification.type === 'idle' || !notification.message) {
    return null;
  }

  const getStyle = () => {
    switch (notification.type) {
      case 'success':
        return {
          backgroundColor: '#F0FDF4',
          borderColor: '#86EFAC',
          color: '#166534',
          icon: '✅',
          title: 'Success',
        };
      case 'duplicate':
        return {
          backgroundColor: '#EFF6FF',
          borderColor: '#93C5FD',
          color: '#1E40AF',
          icon: 'ℹ️',
          title: 'Already Processed (Idempotent)',
        };
      case 'error':
        return {
          backgroundColor: '#FEF2F2',
          borderColor: '#FCA5A5',
          color: '#991B1B',
          icon: '⚠️',
          title: 'Error',
        };
      case 'contention':
        return {
          backgroundColor: '#FFFBEB',
          borderColor: '#FCD34D',
          color: '#B45309',
          icon: '🔒',
          title: 'Processing in Progress',
        };
      case 'submitting':
        return {
          backgroundColor: '#F8FAFC',
          borderColor: '#CBD5E1',
          color: '#475569',
          icon: '⏳',
          title: 'Submitting',
        };
      default:
        return null;
    }
  };

  const styleConfig = getStyle();
  if (!styleConfig) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.875rem 1.25rem',
        marginBottom: '1.25rem',
        borderRadius: '8px',
        border: `1px solid ${styleConfig.borderColor}`,
        backgroundColor: styleConfig.backgroundColor,
        color: styleConfig.color,
        fontSize: '0.875rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.1rem' }}>{styleConfig.icon}</span>
        <div>
          <strong style={{ display: 'block', marginBottom: '0.15rem' }}>
            {styleConfig.title}
          </strong>
          <span>{notification.message}</span>
        </div>
      </div>

      {notification.type !== 'submitting' && (
        <button
          onClick={clearNotification}
          aria-label="Dismiss notification"
          style={{
            background: 'none',
            border: 'none',
            color: styleConfig.color,
            fontSize: '1.25rem',
            cursor: 'pointer',
            padding: '0.25rem',
            lineHeight: 1,
            opacity: 0.7,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};

export default Notification;


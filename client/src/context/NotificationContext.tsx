import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

export type NotificationType = 'idle' | 'submitting' | 'success' | 'error' | 'duplicate' | 'contention';

export interface NotificationState {
  type: NotificationType;
  message: string | null;
  timestamp?: number;
}

export interface NotificationContextValue {
  notification: NotificationState;
  showSuccess: (message?: string) => void;
  showDuplicate: (message?: string) => void;
  showContention: (message?: string) => void;
  showError: (message?: string) => void;
  setSubmitting: (message?: string) => void;
  clearNotification: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notification, setNotification] = useState<NotificationState>({
    type: 'idle',
    message: null,
  });

  const showSuccess = useCallback((message = 'Ledger transaction created successfully.') => {
    setNotification({
      type: 'success',
      message,
      timestamp: Date.now(),
    });
  }, []);

  const showDuplicate = useCallback(
    (message = 'This billing event has already been processed.') => {
      setNotification({
        type: 'duplicate',
        message,
        timestamp: Date.now(),
      });
    },
    []
  );

  const showContention = useCallback(
    (message = 'This transaction is currently being processed. Please try again shortly.') => {
      setNotification({
        type: 'contention',
        message,
        timestamp: Date.now(),
      });
    },
    []
  );

  const showError = useCallback(
    (message = 'Unable to process the transaction. Please try again.') => {
      setNotification({
        type: 'error',
        message,
        timestamp: Date.now(),
      });
    },
    []
  );

  const setSubmitting = useCallback((message = 'Submitting transaction...') => {
    setNotification({
      type: 'submitting',
      message,
      timestamp: Date.now(),
    });
  }, []);

  const clearNotification = useCallback(() => {
    setNotification({
      type: 'idle',
      message: null,
    });
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notification,
        showSuccess,
        showDuplicate,
        showContention,
        showError,
        setSubmitting,
        clearNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};


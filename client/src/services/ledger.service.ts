import api from './api';

export interface LedgerEntry {
  id: string;
  eventId: string;
  tenantId: string;
  type: 'debit' | 'credit';
  amount: number;
  currency: string;
  description?: string;
  status: 'pending' | 'completed' | 'failed';
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerListResponse {
  success: boolean;
  tenantId: string;
  data: LedgerEntry[];
  message?: string;
}

export interface LedgerSingleResponse {
  success: boolean;
  data: LedgerEntry;
  message?: string;
}

export interface CreateLedgerPayload {
  eventId: string;
  type: 'debit' | 'credit';
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface CreateLedgerResponse {
  success: boolean;
  duplicate: boolean;
  message: string;
  data: LedgerEntry;
}

export const ledgerService = {
  getLedgerEntries: async (): Promise<LedgerEntry[]> => {
    const response = await api.get<LedgerListResponse>('/ledger');
    if (!response.data.success || !Array.isArray(response.data.data)) {
      throw new Error(response.data.message || 'Failed to fetch tenant ledger records');
    }
    return response.data.data;
  },

  getLedgerEntry: async (id: string): Promise<LedgerEntry> => {
    const response = await api.get<LedgerSingleResponse>(`/ledger/${id}`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || 'Failed to fetch ledger entry');
    }
    return response.data.data;
  },

  createLedgerEntry: async (payload: CreateLedgerPayload): Promise<CreateLedgerResponse> => {
    const response = await api.post<CreateLedgerResponse>('/ledger', payload);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || 'Failed to process ledger entry');
    }
    return response.data;
  },
};

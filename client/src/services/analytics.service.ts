import api from './api';

export interface SummaryMetrics {
  totalExpenditure: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  currency: string;
  range: string;
}

export interface TimeseriesDataPoint {
  date: string;
  amount: number;
  count: number;
}

export interface TimeseriesMetrics {
  timeseries: TimeseriesDataPoint[];
  range: string;
}

export interface BreakdownMetrics {
  available: boolean;
  data: any[];
  message: string;
  range: string;
}

export interface LimitsMetrics {
  configured: boolean;
  data: any[];
  message: string;
  range: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export const analyticsService = {
  getSummaryMetrics: async (range: string = '30d'): Promise<SummaryMetrics> => {
    const response = await api.get<ApiResponse<SummaryMetrics>>(`/analytics/summary?range=${range}`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || 'Failed to fetch summary metrics');
    }
    return response.data.data;
  },

  getTimeseriesMetrics: async (range: string = '30d'): Promise<TimeseriesMetrics> => {
    const response = await api.get<ApiResponse<TimeseriesMetrics>>(`/analytics/timeseries?range=${range}`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || 'Failed to fetch timeseries metrics');
    }
    return response.data.data;
  },

  getBreakdownMetrics: async (range: string = '30d'): Promise<BreakdownMetrics> => {
    const response = await api.get<ApiResponse<BreakdownMetrics>>(`/analytics/breakdown?range=${range}`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || 'Failed to fetch breakdown metrics');
    }
    return response.data.data;
  },

  getLimitsMetrics: async (range: string = '30d'): Promise<LimitsMetrics> => {
    const response = await api.get<ApiResponse<LimitsMetrics>>(`/analytics/limits?range=${range}`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || 'Failed to fetch usage limits');
    }
    return response.data.data;
  },
};

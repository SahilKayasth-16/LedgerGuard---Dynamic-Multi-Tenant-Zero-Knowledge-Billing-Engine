import mongoose from 'mongoose';
import { getLedgerModel } from '../models/ledger.model';

export interface ISummaryMetrics {
  totalExpenditure: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  currency: string;
  range: string;
}

export interface ITimeseriesDataPoint {
  date: string;
  amount: number;
  count: number;
}

export interface ITimeseriesMetrics {
  timeseries: ITimeseriesDataPoint[];
  range: string;
}

export interface IBreakdownMetrics {
  available: boolean;
  data: any[];
  message: string;
  range: string;
}

export interface ILimitsMetrics {
  configured: boolean;
  data: any[];
  message: string;
  range: string;
}

const getStartDateFromRange = (range: string): Date => {
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
};

export const analyticsService = {
  getSummaryMetrics: async (
    conn: mongoose.Connection,
    tenantId: string,
    range: string
  ): Promise<ISummaryMetrics> => {
    const startDate = getStartDateFromRange(range);
    const Ledger = getLedgerModel(conn);

    const result = await Ledger.aggregate([
      {
        $match: {
          tenantId,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalExpenditure: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'completed'] },
                    { $eq: ['$type', 'debit'] },
                  ],
                },
                '$amount',
                0,
              ],
            },
          },
          totalTransactions: { $sum: 1 },
          successfulTransactions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
            },
          },
          failedTransactions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'failed'] }, 1, 0],
            },
          },
          currency: { $first: '$currency' },
        },
      },
    ]);

    if (!result || result.length === 0) {
      return {
        totalExpenditure: 0,
        totalTransactions: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        currency: 'USD',
        range,
      };
    }

    const data = result[0];
    return {
      totalExpenditure: data.totalExpenditure || 0,
      totalTransactions: data.totalTransactions || 0,
      successfulTransactions: data.successfulTransactions || 0,
      failedTransactions: data.failedTransactions || 0,
      currency: data.currency || 'USD',
      range,
    };
  },

  getTimeseriesMetrics: async (
    conn: mongoose.Connection,
    tenantId: string,
    range: string
  ): Promise<ITimeseriesMetrics> => {
    const startDate = getStartDateFromRange(range);
    const Ledger = getLedgerModel(conn);

    const aggregationResult = await Ledger.aggregate([
      {
        $match: {
          tenantId,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          amount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'completed'] },
                    { $eq: ['$type', 'debit'] },
                  ],
                },
                '$amount',
                0,
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const mapByDate = new Map<string, { amount: number; count: number }>();
    for (const item of aggregationResult) {
      mapByDate.set(item._id, { amount: item.amount, count: item.count });
    }

    const timeseries: ITimeseriesDataPoint[] = [];
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const existing = mapByDate.get(dateStr);
      if (existing) {
        timeseries.push({ date: dateStr, amount: existing.amount, count: existing.count });
      } else {
        timeseries.push({ date: dateStr, amount: 0, count: 0 });
      }
    }

    return {
      timeseries,
      range,
    };
  },

  getBreakdownMetrics: async (
    _conn: mongoose.Connection,
    _tenantId: string,
    range: string
  ): Promise<IBreakdownMetrics> => {
    return {
      available: false,
      data: [],
      message:
        "Resource/category cost breakdown is unavailable because 'category' is not defined on the LedgerEntry schema.",
      range,
    };
  },

  getLimitsMetrics: async (
    _conn: mongoose.Connection,
    _tenantId: string,
    range: string
  ): Promise<ILimitsMetrics> => {
    return {
      configured: false,
      data: [],
      message: 'Usage limits are not configured for this tenant.',
      range,
    };
  },
};

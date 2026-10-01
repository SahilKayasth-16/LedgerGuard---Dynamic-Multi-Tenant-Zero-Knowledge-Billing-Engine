import { Request, Response } from 'express';
import { analyticsService } from '../services/analytics.service';

const VALID_RANGES = ['7d', '30d', '90d'];

export const getAnalyticsSummary = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
    });
    return;
  }

  const range = (req.query.range as string) || '30d';
  if (!VALID_RANGES.includes(range)) {
    res.status(400).json({
      success: false,
      message: 'Invalid range parameter. Must be one of: 7d, 30d, 90d',
    });
    return;
  }

  try {
    const authenticatedTenantId = req.user.tenantId;
    const summary = await analyticsService.getSummaryMetrics(req.tenantDb, authenticatedTenantId, range);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics summary.',
    });
  }
};

export const getAnalyticsTimeseries = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
    });
    return;
  }

  const range = (req.query.range as string) || '30d';
  if (!VALID_RANGES.includes(range)) {
    res.status(400).json({
      success: false,
      message: 'Invalid range parameter. Must be one of: 7d, 30d, 90d',
    });
    return;
  }

  try {
    const authenticatedTenantId = req.user.tenantId;
    const timeseries = await analyticsService.getTimeseriesMetrics(req.tenantDb, authenticatedTenantId, range);

    res.status(200).json({
      success: true,
      data: timeseries,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics timeseries.',
    });
  }
};

export const getAnalyticsBreakdown = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
    });
    return;
  }

  const range = (req.query.range as string) || '30d';
  if (!VALID_RANGES.includes(range)) {
    res.status(400).json({
      success: false,
      message: 'Invalid range parameter. Must be one of: 7d, 30d, 90d',
    });
    return;
  }

  try {
    const authenticatedTenantId = req.user.tenantId;
    const breakdown = await analyticsService.getBreakdownMetrics(req.tenantDb, authenticatedTenantId, range);

    res.status(200).json({
      success: true,
      data: breakdown,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics breakdown.',
    });
  }
};

export const getAnalyticsLimits = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
    });
    return;
  }

  const range = (req.query.range as string) || '30d';
  if (!VALID_RANGES.includes(range)) {
    res.status(400).json({
      success: false,
      message: 'Invalid range parameter. Must be one of: 7d, 30d, 90d',
    });
    return;
  }

  try {
    const authenticatedTenantId = req.user.tenantId;
    const limits = await analyticsService.getLimitsMetrics(req.tenantDb, authenticatedTenantId, range);

    res.status(200).json({
      success: true,
      data: limits,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics limits.',
    });
  }
};

import { Request, Response } from 'express';
import { analyticsService } from '../services/analytics.service';
import { logger } from '../utils/logger';

const VALID_RANGES = ['7d', '30d', '90d'];

export const getAnalyticsSummary = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    logger.error('[ANALYTICS SUMMARY FAILURE] Tenant context missing', {
      traceId: req.traceId,
      path: req.path,
    });
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
      traceId: req.traceId,
    });
    return;
  }

  const range = (req.query.range as string) || '30d';
  if (!VALID_RANGES.includes(range)) {
    logger.warn('[ANALYTICS SUMMARY INVALID RANGE]', {
      traceId: req.traceId,
      range,
    });
    res.status(400).json({
      success: false,
      message: 'Invalid range parameter. Must be one of: 7d, 30d, 90d',
      traceId: req.traceId,
    });
    return;
  }

  try {
    const authenticatedTenantId = req.user.tenantId;
    const summary = await analyticsService.getSummaryMetrics(req.tenantDb, authenticatedTenantId, range);

    logger.info('[ANALYTICS SUMMARY SUCCESS]', {
      traceId: req.traceId,
      tenantId: authenticatedTenantId,
      range,
    });

    res.status(200).json({
      success: true,
      traceId: req.traceId,
      data: summary,
    });
  } catch (error: any) {
    logger.error('[ANALYTICS SUMMARY ERROR]', {
      traceId: req.traceId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics summary.',
      traceId: req.traceId,
    });
  }
};

export const getAnalyticsTimeseries = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
      traceId: req.traceId,
    });
    return;
  }

  const range = (req.query.range as string) || '30d';
  if (!VALID_RANGES.includes(range)) {
    res.status(400).json({
      success: false,
      message: 'Invalid range parameter. Must be one of: 7d, 30d, 90d',
      traceId: req.traceId,
    });
    return;
  }

  try {
    const authenticatedTenantId = req.user.tenantId;
    const timeseries = await analyticsService.getTimeseriesMetrics(req.tenantDb, authenticatedTenantId, range);

    logger.info('[ANALYTICS TIMESERIES SUCCESS]', {
      traceId: req.traceId,
      tenantId: authenticatedTenantId,
      range,
    });

    res.status(200).json({
      success: true,
      traceId: req.traceId,
      data: timeseries,
    });
  } catch (error: any) {
    logger.error('[ANALYTICS TIMESERIES ERROR]', {
      traceId: req.traceId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics timeseries.',
      traceId: req.traceId,
    });
  }
};

export const getAnalyticsBreakdown = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
      traceId: req.traceId,
    });
    return;
  }

  const range = (req.query.range as string) || '30d';
  if (!VALID_RANGES.includes(range)) {
    res.status(400).json({
      success: false,
      message: 'Invalid range parameter. Must be one of: 7d, 30d, 90d',
      traceId: req.traceId,
    });
    return;
  }

  try {
    const authenticatedTenantId = req.user.tenantId;
    const breakdown = await analyticsService.getBreakdownMetrics(req.tenantDb, authenticatedTenantId, range);

    logger.info('[ANALYTICS BREAKDOWN SUCCESS]', {
      traceId: req.traceId,
      tenantId: authenticatedTenantId,
      range,
    });

    res.status(200).json({
      success: true,
      traceId: req.traceId,
      data: breakdown,
    });
  } catch (error: any) {
    logger.error('[ANALYTICS BREAKDOWN ERROR]', {
      traceId: req.traceId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics breakdown.',
      traceId: req.traceId,
    });
  }
};

export const getAnalyticsLimits = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
      traceId: req.traceId,
    });
    return;
  }

  const range = (req.query.range as string) || '30d';
  if (!VALID_RANGES.includes(range)) {
    res.status(400).json({
      success: false,
      message: 'Invalid range parameter. Must be one of: 7d, 30d, 90d',
      traceId: req.traceId,
    });
    return;
  }

  try {
    const authenticatedTenantId = req.user.tenantId;
    const limits = await analyticsService.getLimitsMetrics(req.tenantDb, authenticatedTenantId, range);

    logger.info('[ANALYTICS LIMITS SUCCESS]', {
      traceId: req.traceId,
      tenantId: authenticatedTenantId,
      range,
    });

    res.status(200).json({
      success: true,
      traceId: req.traceId,
      data: limits,
    });
  } catch (error: any) {
    logger.error('[ANALYTICS LIMITS ERROR]', {
      traceId: req.traceId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics limits.',
      traceId: req.traceId,
    });
  }
};

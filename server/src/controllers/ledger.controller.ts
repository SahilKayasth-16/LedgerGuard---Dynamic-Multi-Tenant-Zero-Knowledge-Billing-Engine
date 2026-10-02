import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ledgerService } from '../services/ledger.service';
import { ledgerProcessingService } from '../services/ledger-processing.service';
import { logger } from '../utils/logger';

export const createLedgerEntry = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    logger.error('[LEDGER CREATION FAILURE] Missing tenant database context', {
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

  // Security invariant: tenantId MUST come from verified JWT context
  const authenticatedTenantId = req.user.tenantId;

  const { eventId, type, amount, currency, description, metadata } = req.body;

  logger.info('[LEDGER CREATION START] Processing event request', {
    traceId: req.traceId,
    tenantId: authenticatedTenantId,
    eventId,
    type,
    amount,
    currency,
  });

  // Validation 1: eventId
  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    res.status(400).json({
      success: false,
      message: 'eventId is required and must be a non-empty string.',
      traceId: req.traceId,
    });
    return;
  }

  // Validation 2: type
  if (!type || (type !== 'debit' && type !== 'credit')) {
    res.status(400).json({
      success: false,
      message: "type is required and must be either 'debit' or 'credit'.",
      traceId: req.traceId,
    });
    return;
  }

  // Validation 3: amount
  if (
    amount === undefined ||
    amount === null ||
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    res.status(400).json({
      success: false,
      message: 'amount is required and must be a positive finite number greater than zero.',
      traceId: req.traceId,
    });
    return;
  }

  // Validation 4: currency
  if (
    !currency ||
    typeof currency !== 'string' ||
    currency.trim().length !== 3 ||
    !/^[a-zA-Z]{3}$/.test(currency.trim())
  ) {
    res.status(400).json({
      success: false,
      message: 'currency is required and must be a valid 3-letter currency code (e.g., INR, USD, EUR).',
      traceId: req.traceId,
    });
    return;
  }

  // Validation 5: description (optional)
  if (description !== undefined && typeof description !== 'string') {
    res.status(400).json({
      success: false,
      message: 'description must be a string if provided.',
      traceId: req.traceId,
    });
    return;
  }

  // Validation 6: metadata (optional object)
  if (
    metadata !== undefined &&
    (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))
  ) {
    res.status(400).json({
      success: false,
      message: 'metadata must be a JSON object if provided.',
      traceId: req.traceId,
    });
    return;
  }

  // Process event through unified ledger orchestrator
  const result = await ledgerProcessingService.processLedgerEvent(
    req.tenantDb,
    authenticatedTenantId,
    {
      eventId: eventId.trim(),
      type,
      amount,
      currency: currency.trim().toUpperCase(),
      description: description ? description.trim() : undefined,
      metadata,
    }
  );

  if (result.status === 'REDIS_UNAVAILABLE') {
    logger.warn('[LEDGER CREATION PAUSED] Redis locking unavailable', {
      traceId: req.traceId,
      tenantId: authenticatedTenantId,
      eventId,
    });
    res.status(503).json({
      success: false,
      code: 'REDIS_UNAVAILABLE',
      message: result.message,
      traceId: req.traceId,
    });
    return;
  }

  if (result.status === 'EVENT_PROCESSING') {
    logger.warn('[LEDGER CREATION CONCURRENT] Concurrent event processing in progress', {
      traceId: req.traceId,
      tenantId: authenticatedTenantId,
      eventId,
    });
    res.status(409).json({
      success: false,
      code: 'EVENT_PROCESSING',
      message: result.message,
      traceId: req.traceId,
    });
    return;
  }

  if (result.status === 'FAILED' || !result.entry) {
    logger.warn('[LEDGER CREATION FAILED] Processing failed', {
      traceId: req.traceId,
      tenantId: authenticatedTenantId,
      eventId,
      message: result.message,
    });
    res.status(400).json({
      success: false,
      message: result.message,
      traceId: req.traceId,
    });
    return;
  }

  const entry = result.entry;
  const statusCode = result.duplicate ? 200 : 201;

  logger.info('[LEDGER CREATION SUCCESS] Event committed', {
    traceId: req.traceId,
    tenantId: authenticatedTenantId,
    eventId: entry.eventId,
    entryId: entry._id.toString(),
    duplicate: result.duplicate,
  });

  res.status(statusCode).json({
    success: true,
    duplicate: result.duplicate,
    transactionCommitted: true,
    message: result.message,
    traceId: req.traceId,
    data: {
      id: entry._id,
      eventId: entry.eventId,
      tenantId: entry.tenantId,
      type: entry.type,
      amount: entry.amount,
      currency: entry.currency,
      description: entry.description,
      status: entry.status,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    },
  });
};

export const getLedgerEntries = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
      traceId: req.traceId,
    });
    return;
  }

  try {
    const authenticatedTenantId = req.user.tenantId;
    const entries = await ledgerService.getLedgerEntries(req.tenantDb, authenticatedTenantId);

    const formattedData = entries.map((entry) => ({
      id: entry._id,
      eventId: entry.eventId,
      tenantId: entry.tenantId,
      type: entry.type,
      amount: entry.amount,
      currency: entry.currency,
      description: entry.description,
      status: entry.status,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));

    logger.info('[LEDGER RETRIEVAL SUCCESS] Entries fetched', {
      traceId: req.traceId,
      tenantId: authenticatedTenantId,
      count: formattedData.length,
    });

    res.status(200).json({
      success: true,
      tenantId: authenticatedTenantId,
      traceId: req.traceId,
      data: formattedData,
    });
  } catch (error: any) {
    logger.error('[LEDGER RETRIEVAL ERROR] Failed to fetch entries', {
      traceId: req.traceId,
      tenantId: req.user?.tenantId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ledger entries.',
      traceId: req.traceId,
    });
  }
};

export const getLedgerEntryById = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
      traceId: req.traceId,
    });
    return;
  }

  const id = req.params.id as string;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({
      success: false,
      message: 'Ledger entry not found.',
      traceId: req.traceId,
    });
    return;
  }

  try {
    const authenticatedTenantId = req.user.tenantId;
    const entry = await ledgerService.getLedgerEntryById(req.tenantDb, authenticatedTenantId, id);

    if (!entry) {
      res.status(404).json({
        success: false,
        message: 'Ledger entry not found.',
        traceId: req.traceId,
      });
      return;
    }

    logger.info('[LEDGER FETCH BY ID SUCCESS]', {
      traceId: req.traceId,
      tenantId: authenticatedTenantId,
      entryId: id,
    });

    res.status(200).json({
      success: true,
      traceId: req.traceId,
      data: {
        id: entry._id,
        eventId: entry.eventId,
        tenantId: entry.tenantId,
        type: entry.type,
        amount: entry.amount,
        currency: entry.currency,
        description: entry.description,
        status: entry.status,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      },
    });
  } catch (error: any) {
    logger.error('[LEDGER FETCH BY ID ERROR]', {
      traceId: req.traceId,
      entryId: id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ledger entry.',
      traceId: req.traceId,
    });
  }
};

export const getLedgerAuditLogs = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
      traceId: req.traceId,
    });
    return;
  }

  try {
    const authenticatedTenantId = req.user.tenantId;
    const auditLogs = await ledgerService.getLedgerAuditLogs(req.tenantDb, authenticatedTenantId);

    const formattedData = auditLogs.map((log) => ({
      id: log._id,
      tenantId: log.tenantId,
      eventId: log.eventId,
      ledgerEntryId: log.ledgerEntryId,
      action: log.action,
      status: log.status,
      details: log.details,
      createdAt: log.createdAt,
      updatedAt: log.updatedAt,
    }));

    logger.info('[AUDIT LOGS RETRIEVAL SUCCESS]', {
      traceId: req.traceId,
      tenantId: authenticatedTenantId,
      count: formattedData.length,
    });

    res.status(200).json({
      success: true,
      tenantId: authenticatedTenantId,
      traceId: req.traceId,
      data: formattedData,
    });
  } catch (error: any) {
    logger.error('[AUDIT LOGS RETRIEVAL ERROR]', {
      traceId: req.traceId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ledger audit logs.',
      traceId: req.traceId,
    });
  }
};

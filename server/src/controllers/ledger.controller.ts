import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ledgerService } from '../services/ledger.service';
import { ledgerProcessingService } from '../services/ledger-processing.service';

export const createLedgerEntry = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
    });
    return;
  }

  // Security invariant: tenantId MUST come from verified JWT context
  const authenticatedTenantId = req.user.tenantId;

  const { eventId, type, amount, currency, description, metadata } = req.body;

  // Validation 1: eventId
  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    res.status(400).json({
      success: false,
      message: 'eventId is required and must be a non-empty string.',
    });
    return;
  }

  // Validation 2: type
  if (!type || (type !== 'debit' && type !== 'credit')) {
    res.status(400).json({
      success: false,
      message: "type is required and must be either 'debit' or 'credit'.",
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
    });
    return;
  }

  // Validation 5: description (optional)
  if (description !== undefined && typeof description !== 'string') {
    res.status(400).json({
      success: false,
      message: 'description must be a string if provided.',
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
    res.status(503).json({
      success: false,
      code: 'REDIS_UNAVAILABLE',
      message: result.message,
    });
    return;
  }

  if (result.status === 'EVENT_PROCESSING') {
    res.status(409).json({
      success: false,
      code: 'EVENT_PROCESSING',
      message: result.message,
    });
    return;
  }

  if (result.status === 'FAILED' || !result.entry) {
    res.status(400).json({
      success: false,
      message: result.message,
    });
    return;
  }

  const entry = result.entry;
  const statusCode = result.duplicate ? 200 : 201;

  res.status(statusCode).json({
    success: true,
    duplicate: result.duplicate,
    transactionCommitted: true,
    message: result.message,
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

    res.status(200).json({
      success: true,
      tenantId: authenticatedTenantId,
      data: formattedData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ledger entries.',
    });
  }
};

export const getLedgerEntryById = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
    });
    return;
  }

  const id = req.params.id as string;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({
      success: false,
      message: 'Ledger entry not found.',
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
      });
      return;
    }

    res.status(200).json({
      success: true,
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
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ledger entry.',
    });
  }
};

export const getLedgerAuditLogs = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.user || !req.user.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Authenticated tenant database connection unavailable.',
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

    res.status(200).json({
      success: true,
      tenantId: authenticatedTenantId,
      data: formattedData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ledger audit logs.',
    });
  }
};

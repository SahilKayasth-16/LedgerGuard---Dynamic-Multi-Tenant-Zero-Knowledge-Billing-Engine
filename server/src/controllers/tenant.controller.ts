import { Request, Response } from 'express';
import { getTenantTestModel } from '../models/tenantTestRecord.model';

export const getTenantMe = (req: Request, res: Response): void => {
  if (!req.tenant) {
    res.status(404).json({
      success: false,
      message: 'Tenant identity not resolved.',
    });
    return;
  }

  res.status(200).json({
    success: true,
    tenant: {
      id: req.tenant.tenantId,
      name: req.tenant.name,
      status: req.tenant.status,
    },
  });
};

export const getTenantTestData = async (req: Request, res: Response): Promise<void> => {
  if (!req.tenantDb || !req.tenant) {
    res.status(500).json({
      success: false,
      message: 'Tenant database connection unavailable.',
    });
    return;
  }

  try {
    const TestModel = getTenantTestModel(req.tenantDb);

    // Seed test record if empty to demonstrate tenant database persistence
    const count = await TestModel.countDocuments();
    if (count === 0) {
      await TestModel.create({
        tenantId: req.tenant.tenantId,
        message: `Isolated test record for ${req.tenant.name}`,
      });
    }

    const records = await TestModel.find().select('-__v');

    res.status(200).json({
      success: true,
      tenantId: req.tenant.tenantId,
      data: records,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve tenant test data.',
    });
  }
};


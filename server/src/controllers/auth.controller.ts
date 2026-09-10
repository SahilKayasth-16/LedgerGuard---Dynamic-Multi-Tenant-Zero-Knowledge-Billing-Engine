import { Request, Response } from 'express';
import { generateAccessToken } from '../utils/jwt';

export const login = (req: Request, res: Response): void => {
  const { email } = req.body || {};

  // Controlled development/test authentication for Day 2 foundation
  const userId = email ? `user-${email.split('@')[0]}` : 'user-company-a';
  const tenantId = email && email.includes('b') ? 'tenant-company-b' : 'tenant-company-a';
  const role = 'ADMIN';

  const token = generateAccessToken({
    userId,
    tenantId,
    role,
  });

  res.status(200).json({
    success: true,
    token,
    user: {
      userId,
      tenantId,
      role,
    },
  });
};

export const getMe = (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Unauthenticated request.',
    });
    return;
  }

  res.status(200).json({
    success: true,
    user: {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      role: req.user.role,
    },
  });
};


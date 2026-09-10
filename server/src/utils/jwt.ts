import jwt from 'jsonwebtoken';
import { ensureRsaKeysExist } from './generateKeys';
import { config } from '../config/env';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface GenerateTokenInput {
  userId: string;
  tenantId: string;
  role: string;
  expiresIn?: string | number;
  privateKeyOverride?: string;
  algorithmOverride?: jwt.Algorithm;
}

export const getKeys = () => {
  return ensureRsaKeysExist();
};

export const generateAccessToken = (input: GenerateTokenInput): string => {
  const { privateKey } = getKeys();
  const keyToUse = input.privateKeyOverride || privateKey;

  const payload = {
    sub: input.userId,
    tenantId: input.tenantId,
    role: input.role,
  };

  const options: jwt.SignOptions = {
    algorithm: (input.algorithmOverride as jwt.Algorithm) || 'RS256',
  };

  if (input.expiresIn !== undefined) {
    options.expiresIn = input.expiresIn as any;
  } else {
    options.expiresIn = config.jwtExpiresIn as any;
  }

  return jwt.sign(payload, keyToUse, options);
};

export const verifyAccessToken = (token: string, publicKeyOverride?: string): JwtPayload => {
  const { publicKey } = getKeys();
  const keyToUse = publicKeyOverride || publicKey;

  const decoded = jwt.verify(token, keyToUse, {
    algorithms: ['RS256'],
  }) as jwt.JwtPayload;

  if (!decoded || typeof decoded !== 'object' || !decoded.sub || !decoded.tenantId || !decoded.role) {
    throw new Error('Invalid token payload structure');
  }

  return {
    sub: decoded.sub as string,
    tenantId: decoded.tenantId as string,
    role: decoded.role as string,
    iat: decoded.iat,
    exp: decoded.exp,
  };
};


import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const generateRsaKeyPair = (): { privateKey: string; publicKey: string } => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { privateKey, publicKey };
};

export const ensureRsaKeysExist = (): { privateKey: string; publicKey: string } => {
  const keysDir = path.join(process.cwd(), 'keys');
  const privateKeyPath = path.join(keysDir, 'private.pem');
  const publicKeyPath = path.join(keysDir, 'public.pem');

  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    return { privateKey, publicKey };
  }

  const { privateKey, publicKey } = generateRsaKeyPair();
  fs.writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(publicKeyPath, publicKey, { encoding: 'utf8', mode: 0o644 });

  console.log('[KEYS] RSA-2048 key pair generated in server/keys/');
  return { privateKey, publicKey };
};

ensureRsaKeysExist();


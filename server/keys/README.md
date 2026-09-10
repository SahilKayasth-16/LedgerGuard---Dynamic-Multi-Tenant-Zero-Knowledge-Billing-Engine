# LedgerGuard RSA Key Configuration

LedgerGuard uses RS256 (RSA Signature with SHA-256) for asymmetric JWT signing and verification.

- `private.pem`: Used ONLY by the backend to sign access tokens. **NEVER commit to Git or expose to clients.**
- `public.pem`: Used by the backend to verify incoming JWT signatures.

## Generating Keys for Development

Run the key generator utility script:

```bash
npx tsx src/utils/generateKeys.ts
```

This will output 2048-bit RSA key pair in PEM format inside `server/keys/`.


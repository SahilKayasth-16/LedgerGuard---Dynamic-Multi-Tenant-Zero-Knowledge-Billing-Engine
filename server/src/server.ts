import app from './app';
import { config } from './config/env';

app.listen(config.port, () => {
  console.log(`LedgerGuard API running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
});


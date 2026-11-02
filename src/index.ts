import { loadConfig } from './config.js';
import { Logger } from './logger.js';
import { PolicyEngine } from './policy.js';
import { RateLimiter } from './rateLimiter.js';
import { RelayService } from './relay.js';
import { createServer } from './server.js';
import { installGracefulShutdown } from './shutdown.js';
import { resolveSponsorSecretKey, SponsorAccountManager } from './sponsor.js';

function main(): void {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);

  const sponsor = new SponsorAccountManager(resolveSponsorSecretKey());
  const policy = new PolicyEngine(config.policy);
  const rateLimiter = new RateLimiter(config.rateLimiter);
  const relay = new RelayService({
    sponsor,
    networkPassphrase: config.networkPassphrase,
    horizonUrl: config.horizonUrl,
  });

  const app = createServer({
    relay,
    policy,
    rateLimiter,
    logger,
    networkPassphrase: config.networkPassphrase,
    sponsorPublicKey: sponsor.publicKey,
    maxTxValiditySeconds: config.maxTxValiditySeconds,
    trustProxy: config.trustProxy,
    corsAllowedOrigins: config.corsAllowedOrigins,
  });

  const server = app.listen(config.port, () => {
    logger.info('fee-sponsor-relay listening', {
      port: config.port,
      sponsorPublicKey: sponsor.publicKey,
      horizonUrl: config.horizonUrl,
    });
  });

  installGracefulShutdown({ server, logger });
}

main();

import { initUsers } from './auth';
import { gateway } from './edge';
import { seed } from './store';

let ready: Promise<void> | null = null;

/** Boots the in-browser stand-in backend: deterministic seed, demo users, simulated edge gateway. */
export function initBackend(startGateway = true): Promise<void> {
  if (!ready) {
    ready = (async () => {
      seed();
      await initUsers();
      // One injected demonstration alert so the alert workflow is visible immediately.
      gateway.inject('demo_alert', 'AST-002');
      if (startGateway) gateway.start();
    })();
  }
  return ready;
}

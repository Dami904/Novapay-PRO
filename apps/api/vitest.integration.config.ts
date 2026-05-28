import { defineConfig } from 'vitest/config';
import { config }       from 'dotenv';
import { resolve }      from 'path';

// Load .env.test into process.env BEFORE Vitest forks worker processes.
// Forked workers inherit the parent's environment, so this is the
// earliest reliable hook — envFile alone loads too late for module-level
// env validation in config/env.ts.
config({ path: resolve(__dirname, '.env.test') });

export default defineConfig({
  test: {
    environment: 'node',
    globals:     true,
    include:     ['src/integration/**/*.test.ts'],

    // Vitest 4: poolOptions was removed; singleFork is now a top-level forks option
    pool:  'forks',
    forks: { singleFork: true },

    testTimeout: 30_000,   // Neon cold-start can take 2-3 s on first query
    hookTimeout: 30_000,
  },
});

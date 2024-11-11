import { vi } from 'vitest';

// Mock process.env
process.env = {
  ...process.env,
  NODE_ENV: 'test',
};

// Mock import.meta
vi.stubGlobal('import.meta', {
  env: {},
});

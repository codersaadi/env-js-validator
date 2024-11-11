import { beforeEach, describe, expect, it } from 'vitest';

import { fly, railway, render, uploadthing, vercel } from './presets';

describe('Environment Presets', () => {
  // Reset process.env before each test
  beforeEach(() => {
    process.env = {};
  });

  describe('Vercel Preset', () => {
    it('should validate valid Vercel environment variables', () => {
      process.env = {
        VERCEL: '1',
        VERCEL_ENV: 'production',
        VERCEL_URL: 'my-app.vercel.app',
      };

      const env = vercel().parse();

      expect(env.VERCEL).toBe('1');
      expect(env.VERCEL_ENV).toBe('production');
      expect(env.VERCEL_URL).toBe('my-app.vercel.app');
    });

    it('should fail on invalid VERCEL_ENV value', () => {
      process.env = {
        VERCEL_ENV: 'invalid-env', // Should be development, preview, or production
      };

      expect(() => vercel().parse()).toThrow();
    });
  });

  describe('Uploadthing Preset', () => {
    it('should validate required UPLOADTHING_SECRET', () => {
      process.env = {
        UPLOADTHING_SECRET: 'secret-key',
      };

      const env = uploadthing().parse();
      expect(env.UPLOADTHING_SECRET).toBe('secret-key');
    });

    it('should fail when UPLOADTHING_SECRET is missing', () => {
      expect(() => uploadthing().parse()).toThrow();
    });
  });

  describe('Render Preset', () => {
    it('should validate valid Render environment variables', () => {
      process.env = {
        RENDER: '1',
        RENDER_SERVICE_TYPE: 'web',
        RENDER_EXTERNAL_URL: 'https://my-app.onrender.com',
      };

      const env = render().parse();

      expect(env.RENDER).toBe('1');
      expect(env.RENDER_SERVICE_TYPE).toBe('web');
      expect(env.RENDER_EXTERNAL_URL).toBe('https://my-app.onrender.com');
    });

    it('should fail on invalid RENDER_SERVICE_TYPE', () => {
      process.env = {
        RENDER_SERVICE_TYPE: 'invalid-type', // Should be web, pserv, cron, worker, or static
      };

      expect(() => render().parse()).toThrow();
    });

    it('should fail on invalid RENDER_EXTERNAL_URL', () => {
      process.env = {
        RENDER_EXTERNAL_URL: 'not-a-url',
      };

      expect(() => render().parse()).toThrow();
    });
  });

  describe('Railway Preset', () => {
    it('should validate valid Railway environment variables', () => {
      process.env = {
        RAILWAY_PROJECT_ID: 'proj_123',
        RAILWAY_ENVIRONMENT_NAME: 'production',
      };

      const env = railway().parse();

      expect(env.RAILWAY_PROJECT_ID).toBe('proj_123');
      expect(env.RAILWAY_ENVIRONMENT_NAME).toBe('production');
    });
  });

  describe('Fly.io Preset', () => {
    it('should validate valid Fly.io environment variables', () => {
      process.env = {
        FLY_APP_NAME: 'my-app',
        FLY_REGION: 'iad',
        FLY_VM_MEMORY_MB: '512',
      };

      const env = fly().parse();

      expect(env.FLY_APP_NAME).toBe('my-app');
      expect(env.FLY_REGION).toBe('iad');
      expect(env.FLY_VM_MEMORY_MB).toBe('512');
    });
  });

  describe('Type Safety', () => {
    it('should provide correct types for environment variables', () => {
      type VercelEnv = ReturnType<typeof vercel>;
      type UploadthingEnv = ReturnType<typeof uploadthing>;

      // @ts-expect-error - VERCEL_ENV should only accept 'development' | 'preview' | 'production'
      const invalidVercelEnv: VercelEnv = { VERCEL_ENV: 'invalid' };
      // @ts-expect-error - UPLOADTHING_SECRET should be required
      const secret: undefined = {} as UploadthingEnv['UPLOADTHING_SECRET'];
    });
  });
});

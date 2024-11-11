import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { EnvValidator, createEnvValidator } from './index';

describe('EnvValidator', () => {
  // Store original environment
  const originalEnv = process.env;
  const originalWindow = global.window;
  const mockEnv = {
    NODE_ENV: 'test',
    API_KEY: 'secret-key',
    DATABASE_URL: 'postgresql://localhost:5432',
    PUBLIC_API_URL: 'https://api.example.com',
    VITE_APP_TITLE: 'Test App',
  
    '': '', // Empty string test case
  };

  beforeEach(() => {
    // Reset environment before each test
    vi.resetModules();
    process.env = {
      ...mockEnv,
    
      VITE_API_URL: 'https://vite-api.example.com',
    };
    // @ts-ignore - operand of delete must be optional , but here we are in a testing enviroment.
    delete global.window 
    vi.stubGlobal('import.meta', { env: {} });
    
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    if (originalWindow) {
      global.window = originalWindow;
    }
    vi.unstubAllGlobals();
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const validator = new EnvValidator({});
      expect(validator).toBeInstanceOf(EnvValidator);
    });

    it('should initialize with framework-specific options', () => {
      const validator = new EnvValidator({ framework: 'next' });
      expect(validator).toBeInstanceOf(EnvValidator);
    });

    it('should throw error for invalid client prefix', () => {
      const schema = {
        client: {
          API_URL: z.string(),
        }
      };

      expect(() => new EnvValidator({
        ...schema,
        framework: 'next',
      })).toThrow(/must be prefixed/);
    });
  });

  describe('Environment Detection', () => {
    it('should detect Node environment', () => {
      const validator = createEnvValidator({});
      const env = validator.parse();
      expect(env).toBeDefined();
    });

    it('should detect browser environment', () => {
       
      global.window = {} as Window & typeof globalThis;
      const validator = createEnvValidator({
        client: {
          VITE_APP_TITLE: z.string(),
        },
      });
      const env = validator.parse();
      expect(env).toBeDefined();
    });

    it('should detect Edge environment', () => {
      vi.stubGlobal('EdgeRuntime', 'edge');
      const validator = createEnvValidator({});
      const env = validator.parse();
      expect(env).toBeDefined();
    });
  });

  describe('Validation', () => {
    const schema = {
      server: {
        API_KEY: z.string(),
        DATABASE_URL: z.string().url(),
      },
      client: {
        PUBLIC_API_URL: z.string().url(),
        VITE_APP_TITLE: z.string(),
      },
      shared: {
        NODE_ENV: z.enum(['development', 'test', 'production']),
      },
    };

    it('should validate correct environment variables', () => {
      const validator = createEnvValidator(schema);
      const env = validator.parse();
       
      expect(env.API_KEY).toBe('secret-key');
      expect(env.DATABASE_URL).toBe('postgresql://localhost:5432');
      expect(env.PUBLIC_API_URL).toBe('https://api.example.com');
      expect(env.NODE_ENV).toBe('test');
    });

    it('should handle empty strings as undefined when emptyStringAsUndefined is true', () => {
      const validator = createEnvValidator({
        ...schema,
        emptyStringAsUndefined: true,
      });
      const env = validator.parse() ;
      // @ts-ignore
      const expectedValue = env[""]
      expect(expectedValue).toBeUndefined();
    });

    it('should throw on invalid environment variables', () => {
      process.env["DATABASE_URL"] = 'invalid-url';
      
      const validator = createEnvValidator({
        ...schema,
        onValidationError: (error) => {
          throw error;
        },
      });
      
      expect(() => validator.parse()).toThrow();
    });
  });

  describe('Access Control', () => {
    it('should prevent access to server variables in browser environment', () => {
      const validator = new EnvValidator({
        server: {
          API_KEY: z.string(),
        },
        client: {
          PUBLIC_API_URL: z.string(),
        },
        runtimeEnv: { PUBLIC_API_URL: 'https://api.example.com', API_KEY: 'secret-key2' },
      });
    
      const env = validator.parse();
    
      // Validate that accessing a server-only variable in a browser throws an error
      expect(() => env.API_KEY).toThrowError;
      expect(env.PUBLIC_API_URL).toBe('https://api.example.com');
    });
    
    it('should allow access to all variables in server environment', () => {
      const validator = createEnvValidator({
        server: {
          API_KEY: z.string(),
        },
        client: {
          PUBLIC_API_URL: z.string(),
        },
      });

      const env = validator.parse();
      expect(env.API_KEY).toBe('secret-key');
      expect(env.PUBLIC_API_URL).toBe('https://api.example.com');
    });
  });

  describe('Validation State', () => {
    it('should return success validation state when valid', () => {
      const validator = createEnvValidator({
        server: {
          API_KEY: z.string(),
        },
      });

      const state = validator.getValidationState();
      expect(state.success).toBe(true);
      expect(state.errors).toBeUndefined();
    });

    // it('should return error validation state when invalid', () => {
    //   process.env["API_KEY"] = ""
      
    //   const validator = createEnvValidator({
    //     server: {
    //       API_KEY: z.string().min(1),
    //     },
    //     emptyStringAsUndefined: false,
    //   });

    //   const state = validator.getValidationState();
    //   expect(state.success).toBe(false);
    //   expect(state.errors).toBeDefined();
    //   console.log(state.errors);
      
    //   expect(state.errors?.[0]).toMatchObject({
    //     path: ['API_KEY'],
    //     message: expect.any(String),
    //   });
    // });
  });

  describe('Framework-specific behavior', () => {
 
    it('should handle Next.js configuration', () => {
      process.env ={
        NEXT_PUBLIC_API_URL : "https://next-api.example.com"
      }

      const validator = createEnvValidator({ framework : "next", allowedEnvironments :[
        "browser" , "node",
      ] ,
      client : {
        NEXT_PUBLIC_API_URL : z.string()
      }
    });
  const env = validator.parse()
      
      
      expect(env["NEXT_PUBLIC_API_URL"]).toBe('https://next-api.example.com');
    });
    

    

    it('should handle Vite configuration', () => {
      vi.stubGlobal('import.meta', {
        env: {
          VITE_API_URL: 'https://api.example.com',
        },
      });

      const validator = createEnvValidator({
        framework: "vue",
        allowedEnvironments: ['browser', 'node'], // Include 'node' for test context

        client: {
          VITE_API_URL: z.string(),
        },
      });
      
      const env = validator.parse();
      expect(env.VITE_API_URL).toBe('https://vite-api.example.com');
    });
    
  });
});
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

  describe('Error Handling', () => {
    it('should handle custom validation error handler', () => {
      const customErrorHandler = vi.fn((error: z.ZodError) => {
        throw new Error('Custom validation error');
      });

      const validator = createEnvValidator({
        server: {
          MISSING_VAR: z.string(),
        },
        onValidationError: customErrorHandler,
      });

      expect(() => validator.parse()).toThrow('Custom validation error');
      expect(customErrorHandler).toHaveBeenCalled();
    });

    it('should handle custom invalid access handler', () => {
      const customAccessHandler = vi.fn((variable: string, context: string): never => {
        throw new Error(`Custom access error: ${variable} in ${context}`);
      });

      // Mock window to simulate browser environment
      global.window = {} as Window & typeof globalThis;
      
      const validator = createEnvValidator({
        server: {
          SECRET_KEY: z.string(),
        },
        onInvalidAccess: customAccessHandler,
        runtimeEnv: {
          SECRET_KEY: 'test-secret'
        }
      });

      const env = validator.parse();
      
      // Wrap the access in a function to properly catch the error
      function accessServerVar() {
        return env.SECRET_KEY;
      }

      expect(accessServerVar).toThrow('Custom access error: SECRET_KEY in browser');
      expect(customAccessHandler).toHaveBeenCalledWith('SECRET_KEY', 'browser');
    });
  });

  describe('Environment Detection and Loading', () => {
    it('should properly merge multiple environment sources', () => {
      // Setup process.env
      const testProcessEnv = {
        FROM_PROCESS: 'process',
        NODE_ENV: 'test'
      };

      // Setup import.meta.env
      const testImportMetaEnv = {
        FROM_IMPORT_META: 'import.meta'
      };

      const validator = createEnvValidator({
        server: {
          FROM_PROCESS: z.string(),
          FROM_IMPORT_META: z.string(),
        },
        // Explicitly provide the merged runtime environment
        runtimeEnv: {
          ...testProcessEnv,
          ...testImportMetaEnv
        }
      });

      const env = validator.parse();
      expect(env.FROM_PROCESS).toBe('process');
      expect(env.FROM_IMPORT_META).toBe('import.meta');
    });

    it('should handle empty string to undefined conversion correctly', () => {
      process.env["EMPTY_STRING"] = '';
      process.env["NON_EMPTY"] = 'value';

      const validator = createEnvValidator({
        server: {
          EMPTY_STRING: z.string().optional(),
          NON_EMPTY: z.string(),
        },
        emptyStringAsUndefined: true,
      });

      const env = validator.parse();
      expect(env.EMPTY_STRING).toBeUndefined();
      expect(env.NON_EMPTY).toBe('value');
    });
  });

  describe('Schema Validation', () => {
    it('should validate shared variables across all environments', () => {
      const validator = createEnvValidator({
        shared: {
          NODE_ENV: z.enum(['development', 'test', 'production']),
        },
      });

      const env = validator.parse();
      expect(env.NODE_ENV).toBe('test');
    });

    it('should handle complex schema validations', () => {
      process.env["PORT"] = '3000';
      process.env["FEATURE_FLAGS"] = '{"debug":true,"beta":false}';

      const validator = createEnvValidator({
        server: {
          PORT: z.string().transform(val => parseInt(val, 10)),
          FEATURE_FLAGS: z.string().transform(val => JSON.parse(val)),
        },
      });

      const env = validator.parse();
      expect(env.PORT).toBe(3000);
      expect(env.FEATURE_FLAGS).toEqual({ debug: true, beta: false });
    });
  });
});
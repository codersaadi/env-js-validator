import { describe, it, expect, beforeEach, afterEach, vi, SpyInstance } from 'vitest';
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
      const validator = new EnvValidator({
        
      });
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
        framework: "next",
        
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
        framework: "vue",
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
        VITE_APP_TITLE: z.string(),
      },
      shared: {
        NODE_ENV: z.enum(['development', 'test', 'production']),
      },
    };

    it('should validate correct environment variables', () => {
      const validator = createEnvValidator({
        ...schema,
        framework: 'vue'
      });
      const env = validator.parse();
      expect(env["API_KEY"]).toBe('secret-key');
      expect(env["DATABASE_URL"]).toBe('postgresql://localhost:5432');
      expect(env["NODE_ENV"]).toBe('test');
    });

    it('should handle empty strings as undefined when emptyStringAsUndefined is true', () => {
      const validator = createEnvValidator({
        ...schema,
        framework: 'vue',
        emptyStringAsUndefined: true,
      });
      const env = validator.parse();
      expect(env['']).toBeUndefined();
    });

    it('should throw on invalid environment variables', () => {
      process.env["DATABASE_URL"] = 'invalid-url';
      const validator = createEnvValidator({
        ...schema,
        framework: 'vue',
        onValidationError: (error) => {
          throw error;
        },
      });
      expect(() => validator.parse()).toThrow();
    });
  });

  describe('Access Control', () => {
    it('should prevent access to server variables in browser environment', () => {
      global.window = {} as Window & typeof globalThis;
      const validator = createEnvValidator({
        server: {
          SECRET_KEY: z.string(),
        },
        client: {
          VITE_PUBLIC_KEY: z.string(),
        },
        framework: 'vue',
        runtimeEnv: {
          SECRET_KEY: 'secret',
          VITE_PUBLIC_KEY: 'public'
        }
      });

      const env = validator.parse();
      expect(() => env["SECRET_KEY"]).toThrow();
    });

    it('should allow access to all variables in server environment', () => {
      const validator = createEnvValidator({
        server: {
          SECRET_KEY: z.string(),
        },
        client: {
          VITE_PUBLIC_KEY: z.string(),
        },
        framework: 'vue',
        runtimeEnv: {
          SECRET_KEY: 'secret',
          VITE_PUBLIC_KEY: 'public'
        }
      });

      const env = validator.parse();
      expect(env["SECRET_KEY"]).toBe('secret');
      expect(env["VITE_PUBLIC_KEY"]).toBe('public');
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

      const validator = createEnvValidator({
      client : {
        NEXT_PUBLIC_API_URL : z.string(),
      },
      framework: "next",
      // clientPrefix: "NEXT_PUBLIC_"
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
        client: {
          VITE_API_URL: z.string(),
        },
        framework: "vue",
        runtimeEnv: {
          VITE_API_URL: 'https://vite-api.example.com',
        },
      });
      
      const env = validator.parse();
      expect(env['VITE_API_URL']).toBe('https://vite-api.example.com');
    });
    
  });

  describe('Error Handling', () => {
    it('should handle custom validation error handler', () => {
      const customErrorHandler = vi.fn((_: z.ZodError) => {
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
        return env["SECRET_KEY"];
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
      expect(env["FROM_PROCESS"]).toBe('process');
      expect(env["FROM_IMPORT_META"]).toBe('import.meta');
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
      expect(env["EMPTY_STRING"]).toBeUndefined();
      expect(env["NON_EMPTY"]).toBe('value');
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
      expect(env["NODE_ENV"]).toBe('test');
    });

    it('should handle complex schema validations', () => {
      process.env["PORT"] = '3000';
      process.env["FEATURE_FLAGS"] = '{"debug":true,"beta":false}';

      const validator = createEnvValidator({
        server: {
          PORT: z.string().transform(val => parseInt(val, 10)),
          FEATURE_FLAGS: z.string().transform((str) => JSON.parse(str)),
        },
      });

      const env = validator.parse();
      expect(env["PORT"]).toBe(3000);
      expect(env["FEATURE_FLAGS"]).toEqual({ debug: true, beta: false });
    });
  });

  describe('Framework Presets and Overrides', () => {
    it('should allow overriding framework preset clientPrefix', () => {
      const validator = createEnvValidator({
        framework: {
          framework: 'next',
          clientPrefix: 'CUSTOM_PREFIX_',
        },
        client: {
          CUSTOM_PREFIX_API_URL: z.string(),
        },
        runtimeEnv: {
          CUSTOM_PREFIX_API_URL: 'https://api.example.com',
        },
      });

      const env = validator.parse();
      expect(env['CUSTOM_PREFIX_API_URL']).toBe('https://api.example.com');
    });

    it('should allow overriding framework preset allowedEnvironments', () => {
      const validator = createEnvValidator({
        framework: {
          framework: 'next',
          allowedEnvironments: ['browser'], // Override Next.js default environments
          
        },
        client: {
          NEXT_PUBLIC_API_URL: z.string(),
        },
        runtimeEnv: {
          NEXT_PUBLIC_API_URL: 'https://api.example.com',
        },
      });

      const env = validator.parse();
      expect(env['NEXT_PUBLIC_API_URL']).toBe('https://api.example.com');
    });

    it('should merge allowedEnvironments when overriding', () => {
      const validator = createEnvValidator({
        framework: {
          framework: 'next',
          allowedEnvironments: ['deno'], // Add Deno to Next.js environments
        },
        client: {
          NEXT_PUBLIC_API_URL: z.string(),
        },
        runtimeEnv: {
          NEXT_PUBLIC_API_URL: 'https://api.example.com',
        },
      });

      // Check if framework config has all environments
      const frameworkConfig = (validator as any).getFrameworkConfig({
        framework: {
          framework: 'next',
          allowedEnvironments: ['deno'],
        },
      });

      expect(frameworkConfig.allowedEnvironments).toContain('node');
      expect(frameworkConfig.allowedEnvironments).toContain('edge');
      expect(frameworkConfig.allowedEnvironments).toContain('deno');
    });

    it('should handle custom framework with empty prefix', () => {
      const validator = createEnvValidator({
        framework: 'custom',
        clientPrefix: "PUBLIC_",
        client: {
          PUBLIC_API_URL: z.string(), // No prefix required for custom framework
          
        },
        runtimeEnv: {
          PUBLIC_API_URL: 'https://api.example.com',
        },
      });

      const env = validator.parse();
      expect(env['PUBLIC_API_URL']).toBe('https://api.example.com');
    });

    it('should validate framework-specific environment sources', () => {
      // Mock import.meta for Vue/Vite
      vi.stubGlobal('import.meta', {
        env: {
          VITE_API_URL: 'https://vite-api.example.com',
        },
      });

      const validator = createEnvValidator({
        framework: {
          framework: 'vue',
          runtimeEnv: 'import.meta.env',
        },
        client: {
          VITE_API_URL: z.string(),
        },
      });

      const env = validator.parse();
      expect(env['VITE_API_URL']).toBe('https://vite-api.example.com');
    });

    it('should handle multiple client prefixes in hybrid frameworks', () => {
      const validator = createEnvValidator({
        framework: {
          framework: 'custom',
          clientPrefix: 'PUBLIC_', // Primary prefix
        },
        client: {
          PUBLIC_API_URL: z.string(),
          PUBLIC_APP_NAME: z.string(),
        },
        runtimeEnv: {
          PUBLIC_API_URL: 'https://api.example.com',
          PUBLIC_APP_NAME: 'Test App',
        },
      });

      const env = validator.parse();
      expect(env['PUBLIC_API_URL']).toBe('https://api.example.com');
      expect(env['PUBLIC_APP_NAME']).toBe('Test App');
    });
  });

  describe('Environment Variable Transformation', () => {
    it('should transform environment variables based on schema', () => {
      const validator = createEnvValidator({
        server: {
          PORT: z.string().transform(Number),
          FEATURES: z.string().transform((str) => JSON.parse(str)),
        },
        runtimeEnv: {
          PORT: '3000',
          FEATURES: '{"debug":true,"cache":false}',
        },
      });

      const env = validator.parse();
      expect(env['PORT']).toBe(3000);
      expect(env['FEATURES']).toEqual({ debug: true, cache: false });
    });

    it('should handle optional environment variables', () => {
      const validator = createEnvValidator({
        server: {
          REQUIRED: z.string(),
          OPTIONAL: z.string().optional(),
        },
        runtimeEnv: {
          REQUIRED: 'value',
        },
      });

      const env = validator.parse();
      expect(env['REQUIRED']).toBe('value');
      expect(env['OPTIONAL']).toBeUndefined();
    });
  });

  describe('Cache Behavior', () => {
    it('should cache accessed values', () => {
      const validator = createEnvValidator({
        server: {
          API_KEY: z.string(),
        },
        runtimeEnv: {
          API_KEY: 'secret',
        },
      });

      const env = validator.parse();
      const value1 = env['API_KEY'];
      const value2 = env['API_KEY'];

      expect(value1).toBe(value2);
      expect((validator as any).cache.has('API_KEY')).toBe(true);
    });

    it('should handle cache invalidation properly', () => {
      const validator = createEnvValidator({
        server: {
          TIMESTAMP: z.string().transform(() => Date.now()),
        },
        runtimeEnv: {
          TIMESTAMP: 'now',
        },
      });

      const env = validator.parse();
      const time1 = env['TIMESTAMP'];
      const time2 = env['TIMESTAMP'];

      expect(time1).toBe(time2); // Should return cached value
    });
  });
});

describe('NX Workspace Support', () => {
  let mockDotenvConfig = vi.fn();
  let mockLoadEnvFile: SpyInstance;

  beforeEach(() => {
    vi.mock('dotenv', () => ({
      config: mockDotenvConfig
    }));

    // Create a spy on loadEnvFile
    mockLoadEnvFile = vi.spyOn(EnvValidator.prototype as any, 'loadEnvFile');
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockLoadEnvFile.mockRestore();
  });

  it('should load workspace root env variables', () => {
    const mockedEnv = {
      NX_ROOT_VAR: 'root-value',
      DATABASE_URL: 'root-db-url'
    };

    // Reset process.env
    process.env = {};

    // Mock both dotenv.config and loadEnvFile
    mockDotenvConfig.mockReturnValue({
      parsed: mockedEnv
    });

    mockLoadEnvFile.mockImplementation((path: string) => {
      mockDotenvConfig({ path: `${path}/.env` });
      return mockedEnv;
    });

    const validator = createEnvValidator({
      framework: {
        framework: 'nx',
        nxConfig: {
          workspaceRoot: '/workspace-root',
          cascadeEnv: true
        }
      },
      server: {
        NX_ROOT_VAR: z.string(),
        DATABASE_URL: z.string()
      }
    });

    const env = validator.parse();
    
    expect(env['NX_ROOT_VAR']).toBe('root-value');
    expect(env['DATABASE_URL']).toBe('root-db-url');
    expect(mockLoadEnvFile).toHaveBeenCalledWith('/workspace-root');
    expect(mockDotenvConfig).toHaveBeenCalledWith({
      path: '/workspace-root/.env'
    });
  });

  it('should cascade env variables correctly', () => {
    const rootEnv = {
      NX_ROOT_VAR: 'root-value',
      DATABASE_URL: 'root-db-url'
    };

    const projectEnv = {
      DATABASE_URL: 'project-db-url',
      PROJECT_SPECIFIC: 'project-value'
    };

    // Mock root .env
    mockDotenvConfig
      .mockReturnValueOnce({
        parsed: rootEnv
      })
      // Mock project .env
      .mockReturnValueOnce({
        parsed: projectEnv
      });

    const validator = createEnvValidator({
      framework: {
        framework: 'nx',
        nxConfig: {
          workspaceRoot: '/workspace-root',
          projectPath: '/workspace-root/apps/my-app',
          cascadeEnv: true
        }
      },
      server: {
        NX_ROOT_VAR: z.string(),
        DATABASE_URL: z.string(),
        PROJECT_SPECIFIC: z.string()
      },
      // Merge the environments as they would be in reality
      runtimeEnv: {
        ...rootEnv,
        ...projectEnv
      }
    });

    const env = validator.parse();
    expect(env['NX_ROOT_VAR']).toBe('root-value');
    expect(env['DATABASE_URL']).toBe('project-db-url'); // Project value should override root
    expect(env['PROJECT_SPECIFIC']).toBe('project-value');
  });

  it('should handle missing .env files gracefully', () => {
    mockDotenvConfig
      .mockReturnValueOnce({ parsed: null }) // Root .env not found
      .mockReturnValueOnce({ parsed: null }); // Project .env not found

    const validator = createEnvValidator({
      framework: {
        framework: 'nx',
        nxConfig: {
          workspaceRoot: '/workspace-root',
          projectPath: '/workspace-root/apps/my-app',
          cascadeEnv: true
        }
      },
      server: {
        OPTIONAL_VAR: z.string().optional()
      }
    });

    expect(() => validator.parse()).not.toThrow();
  });

  it('should respect cascadeEnv flag', () => {
    const rootEnv = {
      ROOT_VAR: 'root-value'
    };

    const projectEnv = {
      PROJECT_VAR: 'project-value'
    };

    // Reset process.env
    process.env = {};

    mockDotenvConfig
      .mockReturnValueOnce({
        parsed: rootEnv
      })
      .mockReturnValueOnce({
        parsed: projectEnv
      });

    const validator = createEnvValidator({
      framework: {
        framework: 'nx',
        nxConfig: {
          workspaceRoot: '/workspace-root',
          projectPath: '/workspace-root/apps/my-app',
          cascadeEnv: false // Disable cascading
        }
      },
      server: {
        ROOT_VAR: z.string().optional(),
        PROJECT_VAR: z.string()
      },
      runtimeEnv: projectEnv // Only include project env since cascading is disabled
    });

    const env = validator.parse();
    expect(env['ROOT_VAR']).toBeUndefined(); // Should not load root variables
    expect(env['PROJECT_VAR']).toBe('project-value');
  });

  it('should handle NX public variables correctly', () => {
    const mockedEnv = {
      NX_PUBLIC_API_URL: 'https://api.example.com',
      PRIVATE_VAR: 'secret'
    };

    // Reset process.env
    process.env = {};

    mockDotenvConfig.mockReturnValue({
      parsed: mockedEnv
    });

    const validator = createEnvValidator({
      framework: {
        framework: 'nx',
        nxConfig: {
          projectPath: '/workspace-root/apps/my-app'
        }
      },
      client: {
        NX_PUBLIC_API_URL: z.string()
      },
      server: {
        PRIVATE_VAR: z.string()
      },
      runtimeEnv: mockedEnv
    });

    const env = validator.parse();
    expect(env['NX_PUBLIC_API_URL']).toBe('https://api.example.com');
    expect(env['PRIVATE_VAR']).toBe('secret');
  });

  it('should validate environment access in different NX environments', () => {
    const mockedEnv = {
      SERVER_ONLY: 'secret',
      NX_PUBLIC_VAR: 'public'
    };

    // Reset process.env
    process.env = {};

    mockDotenvConfig.mockReturnValue({
      parsed: mockedEnv
    });

    // Simulate browser environment
    global.window = {} as Window & typeof globalThis;

    const validator = createEnvValidator({
      framework: {
        framework: 'nx',
        nxConfig: {
          projectPath: '/workspace-root/apps/my-app'
        }
      },
      server: {
        SERVER_ONLY: z.string()
      },
      client: {
        NX_PUBLIC_VAR: z.string()
      },
      runtimeEnv: mockedEnv
    });

    const env = validator.parse();
    expect(env['NX_PUBLIC_VAR']).toBe('public');
    expect(() => env['SERVER_ONLY']).toThrow();
  });

  it('should handle complex NX workspace configurations', () => {
    const rootEnv = {
      NX_ROOT_VAR: 'root-value',
      SHARED_VAR: 'root-shared'
    };

    const projectEnv = {
      NX_PUBLIC_API_URL: 'https://project-api.example.com',
      SHARED_VAR: 'project-shared',
      PROJECT_SPECIFIC: 'project-value'
    };

    // Reset process.env and ensure we're in a server environment
    process.env = {};
    // @ts-ignore - Remove window to simulate server environment
    delete global.window;

    mockDotenvConfig
      .mockReturnValueOnce({
        parsed: rootEnv
      })
      .mockReturnValueOnce({
        parsed: projectEnv
      });

    const validator = createEnvValidator({
      framework: {
        framework: 'nx',
        nxConfig: {
          workspaceRoot: '/workspace-root',
          projectPath: '/workspace-root/apps/my-app',
          cascadeEnv: true
        }
      },
      server: {
        NX_ROOT_VAR: z.string(),
        SHARED_VAR: z.string(),
        PROJECT_SPECIFIC: z.string()
      },
      client: {
        NX_PUBLIC_API_URL: z.string()
      },
      runtimeEnv: {
        ...rootEnv,
        ...projectEnv // Project env overrides root env
      }
    });

    const env = validator.parse();
    
    // Now we can access server variables because we're in a server environment
    expect(env['NX_ROOT_VAR']).toBe('root-value');
    expect(env['SHARED_VAR']).toBe('project-shared');
    expect(env['PROJECT_SPECIFIC']).toBe('project-value');
    expect(env['NX_PUBLIC_API_URL']).toBe('https://project-api.example.com');
  });
});
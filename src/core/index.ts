import { type ZodError, type ZodObject, type ZodType, z } from 'zod';

// Type utilities
export type Simplify<T> = { [P in keyof T]: T[P] } & {};
// type Impossible<T> = Partial<Record<keyof T, never>>;

// Environment types
export type RuntimeEnvironment = 'node' | 'edge' | 'browser' | 'deno';
export type EnvSource = 'process.env' | 'import.meta.env' | 'Deno.env' | 'custom';

// Base configuration interface
export interface BaseConfig {
  isServer?: boolean;
  skipValidation?: boolean;
  emptyStringAsUndefined?: boolean;
  onValidationError?: (error: ZodError) => never;
  onInvalidAccess?: (variable: string, context: RuntimeEnvironment) => never;
}

// Schema configuration
export interface SchemaConfig<
  TServer extends Record<string, ZodType> = Record<string, ZodType>,
  TClient extends Record<string, ZodType> = Record<string, ZodType>,
  TShared extends Record<string, ZodType> = Record<string, ZodType>,
> {
  server?: TServer;
  client?: TClient;
  shared?: TShared;
  clientPrefix?: string;
}

// Runtime environment configuration
export interface RuntimeConfig {
  runtimeEnv?: Record<string, unknown>;
  framework?: SupportedFrameworks | FrameworkConfig;
}

// Combined configuration type
export type EnvConfig<
  TServer extends Record<string, ZodType> = Record<string, ZodType>,
  TClient extends Record<string, ZodType> = Record<string, ZodType>,
  TShared extends Record<string, ZodType> = Record<string, ZodType>,
> = BaseConfig &
  SchemaConfig<TServer, TClient, TShared> & {
    runtimeEnv?: Record<string, unknown>;
    framework?: SupportedFrameworks | FrameworkConfig;
  };

// Framework preset configuration type
export interface FrameworkPreset {
  clientPrefix: string;
  runtimeEnv: EnvSource;
  allowedEnvironments: RuntimeEnvironment[];
}

// Framework configuration with overrides
export interface FrameworkConfig extends Partial<FrameworkPreset> {
  framework: SupportedFrameworks;
  nxConfig?: NXWorkspaceConfig;
}

// Framework presets
export const FRAMEWORK_PRESETS = {
  next: {
    clientPrefix: 'NEXT_PUBLIC_',
    runtimeEnv: 'process.env' as const,
    allowedEnvironments: ['node', 'edge'] as const,
  },
  remix: {
    clientPrefix: 'PUBLIC_',
    runtimeEnv: 'process.env' as const,
    allowedEnvironments: ['node', 'browser'] as const,
  },
  react: {
    clientPrefix: 'REACT_APP_',
    runtimeEnv: 'process.env' as const,
    allowedEnvironments: ['browser'] as const,
  },
  vue: {
    clientPrefix: 'VITE_',
    runtimeEnv: 'import.meta.env' as const,
    allowedEnvironments: ['browser'] as const,
  },
  solid: {
    clientPrefix: 'VITE_',
    runtimeEnv: 'import.meta.env' as const,
    allowedEnvironments: ['browser'] as const,
  },
  nx: {
    clientPrefix: 'NX_PUBLIC_',
    runtimeEnv: 'process.env' as const,
    allowedEnvironments: ['node', 'browser'] as const,
    workspaceConfig: {
      rootEnvPath: true, // whether to load workspace root .env
      cascadeEnv: true, // whether to cascade env variables
      projectEnvPath: true, // whether to load project-specific .env
    },
  },
  nuxt: {
    clientPrefix: 'NUXT_PUBLIC_',
    runtimeEnv: 'process.env' as const,
    allowedEnvironments: ['node', 'browser'] as const,
  },
  custom: {
    clientPrefix: 'PUBLIC_',
    runtimeEnv: 'custom',
    allowedEnvironments: ['node', 'browser', 'edge', 'deno'] as const,
  },
} as const;

// More precise framework types
export type SupportedFrameworks = keyof typeof FRAMEWORK_PRESETS;
export type FrameworkPrefix<T extends SupportedFrameworks> =
  (typeof FRAMEWORK_PRESETS)[T]['clientPrefix'];
export type FrameworkEnv<T extends SupportedFrameworks> =
  (typeof FRAMEWORK_PRESETS)[T]['runtimeEnv'];
export type FrameworkAllowedEnvs<T extends SupportedFrameworks> =
  (typeof FRAMEWORK_PRESETS)[T]['allowedEnvironments'][number];

// Add new interface for NX workspace configuration
export interface NXWorkspaceConfig {
  workspaceRoot?: string;
  projectPath?: string;
  cascadeEnv?: boolean;
}

export class EnvValidator<
  TServer extends Record<string, ZodType>,
  TClient extends Record<string, ZodType>,
  TShared extends Record<string, ZodType>,
> {
  private readonly config: EnvConfig<TServer, TClient, TShared>;
  private cache = new Map<string, unknown>();
  private schema: ZodObject<TServer & TClient & TShared>;
  private environment: RuntimeEnvironment;

  constructor(config: EnvConfig<TServer, TClient, TShared>) {
    this.validateClientPrefix(config);

    this.config = this.processConfig(config);
    this.environment = this.detectEnvironment();
    this.schema = this.buildSchema();
  }

  private validateClientPrefix(config: EnvConfig<TServer, TClient, TShared>): void {
    const { client } = config;

    // Skip validation if no client variables
    if (!client || Object.keys(client).length === 0) {
      return;
    }
    // Get framework-specific prefix if using a framework
    const frameworkConfig = config.framework ? this.getFrameworkConfig(config) : null;
    const expectedPrefix = frameworkConfig?.clientPrefix || config.clientPrefix;

    // Only validate if we have both client variables and a framework/prefix specified
    if (expectedPrefix) {
      for (const key of Object.keys(client)) {
        if (!key.startsWith(expectedPrefix)) {
          throw new Error(
            `Client variable "${key}" must be prefixed with "${expectedPrefix}" (${config.framework || 'custom'} framework)`
          );
        }
      }
    } else if (Object.keys(client).length > 0) {
      throw new Error('Client variables require a prefix. Set clientPrefix or use a framework.');
    }
  }

  private processConfig(
    config: EnvConfig<TServer, TClient, TShared>
  ): EnvConfig<TServer, TClient, TShared> {
    // Get framework preset and potential overrides
    const frameworkConfig = this.getFrameworkConfig(config);

    return {
      isServer: typeof window === 'undefined',
      skipValidation: false,
      emptyStringAsUndefined: false,
      clientPrefix: frameworkConfig?.clientPrefix ?? config.clientPrefix ?? '',
      onValidationError: (error: ZodError) => {
        console.error('❌ Environment validation error:', error.flatten().fieldErrors);
        throw new Error('Environment validation error');
      },
      onInvalidAccess: (variable: string, context: RuntimeEnvironment) => {
        throw new Error(
          `❌ Attempted to access server-side environment variable '${variable}' in ${context} environment`
        );
      },
      ...config,
      ...(frameworkConfig && { clientPrefix: frameworkConfig.clientPrefix }),
    };
  }

  private getFrameworkConfig(config: EnvConfig<TServer, TClient, TShared>): FrameworkPreset | null {
    if (!config.framework) return null;

    // If framework is just a string, use preset
    if (typeof config.framework === 'string') {
      return {
        ...FRAMEWORK_PRESETS[config.framework],
        allowedEnvironments: [...FRAMEWORK_PRESETS[config.framework].allowedEnvironments],
      };
    }

    // If framework is a config object, merge with preset
    const preset = FRAMEWORK_PRESETS[config.framework.framework];
    return {
      ...preset,
      ...config.framework,
      // Ensure allowedEnvironments is mutable by spreading into new array
      allowedEnvironments: [
        ...(preset?.allowedEnvironments || []),
        ...(config.framework.allowedEnvironments || []),
      ],
    };
  }

  private detectEnvironment(): RuntimeEnvironment {
    if (typeof Deno !== 'undefined') return 'deno';
    if (typeof EdgeRuntime !== 'undefined') return 'edge';
    if (typeof window !== 'undefined') return 'browser';
    return 'node';
  }

  private buildSchema(): ZodObject<TServer & TClient & TShared> {
    const { server = {}, client = {}, shared = {} } = this.config;
    return z.object({
      ...server,
      ...client,
      ...shared,
    }) as ZodObject<TServer & TClient & TShared>;
  }

  private getRuntimeEnv(): Record<string, unknown> {
    if (this.config.runtimeEnv) {
      return this.config.runtimeEnv;
    }

    let env: Record<string, unknown> = {};

    // Handle NX workspace environment loading
    if (
      this.config.framework &&
      typeof this.config.framework === 'object' &&
      this.config.framework.framework === 'nx' &&
      this.config.framework.nxConfig
    ) {
      const { workspaceRoot, projectPath, cascadeEnv } = this.config.framework.nxConfig;

      // Load workspace root .env if exists
      if (workspaceRoot && cascadeEnv) {
        env = { ...env, ...this.loadEnvFile(workspaceRoot) };
      }

      // Load project-specific .env if exists
      if (projectPath) {
        env = { ...env, ...this.loadEnvFile(projectPath) };
      }
    }

    // Existing environment loading logic
    if (typeof process !== 'undefined' && process.env) {
      env = { ...env, ...process.env };
    }

    if (typeof import.meta !== 'undefined' && import.meta.env) {
      env = { ...env, ...import.meta.env };
    }

    // Transform empty strings if configured
    if (this.config.emptyStringAsUndefined) {
      env = Object.fromEntries(Object.entries(env).filter(([_, value]) => value !== ''));
    }

    return env;
  }

  // Add helper method to load .env files
  private loadEnvFile(path: string): Record<string, unknown> {
    try {
      // Make sure we're calling dotenv.config with the correct path
      const result = require('dotenv').config({ path: `${path}/.env` });
      return result.parsed || {};
    } catch (error) {
      console.warn(`Failed to load .env file from ${path}`, error);
      return {};
    }
  }

  private validateAccess(key: string): void {
    const isServerVar =
      this.config.server?.[key] && !this.config.client?.[key] && !this.config.shared?.[key];

    if (isServerVar && this.environment === 'browser') {
      this.config.onInvalidAccess?.(key, this.environment);
    }
  }

  public parse(): z.infer<typeof this.schema> {
    if (this.config.skipValidation) {
      return this.getRuntimeEnv() as z.infer<typeof this.schema>;
    }

    const env = this.getRuntimeEnv() || {};
    const result = this.schema.safeParse(env);

    if (!result.success) {
      this.config.onValidationError?.(result.error);
      // Force throw if onValidationError doesn't
      throw new Error('Validation failed');
    }

    return new Proxy(result.data, {
      get: (target, prop) => {
        if (typeof prop !== 'string') return undefined;
        if (prop === '__esModule' || prop === '$$typeof') return undefined;

        this.validateAccess(prop);

        if (this.cache.has(prop)) {
          return this.cache.get(prop);
        }

        const value = Reflect.get(target, prop);
        this.cache.set(prop, value);
        return value;
      },
    });
  }

  public getValidationState() {
    const env = this.getRuntimeEnv();
    const result = this.schema.safeParse(env);

    return {
      success: result.success,
      errors: !result.success ? result.error.flatten().fieldErrors : undefined,
    };
  }
}

// Helper function with improved type definitions
export function createEnvValidator<
  TServer extends Record<string, ZodType>,
  TClient extends Record<string, ZodType>,
  TShared extends Record<string, ZodType>,
>(
  config: Omit<EnvConfig<TServer, TClient, TShared>, 'framework'> & {
    framework?: SupportedFrameworks | FrameworkConfig;
  }
) {
  return new EnvValidator(config);
}

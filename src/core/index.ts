import { type ZodError, type ZodType, z } from 'zod';

export type RuntimeEnvironment = 'node' | 'edge' | 'browser' | 'deno';
export type EnvSource = 'process.env' | 'import.meta.env' | 'Deno.env' | 'custom';

interface ValidationResult {
  success: boolean;
  errors?: Array<{ path: string[]; message: string }>;
}

// Helper for framework-specific configuration
type FrameworkConfig = {
  clientPrefix: string;
  runtimeEnv: EnvSource;
  defaultValidation?: boolean;
  allowedEnvironments?: RuntimeEnvironment[];
  monorepo?: MonorepoConfig;
  envFilePath?: string | string[];
};
type SupportedFrameworks = "next" | "remix" | "react" | "vue" | "solid" | "nx" | "nuxt" | "custom"
const FRAMEWORK_CONFIGS: Record<string, FrameworkConfig> = {
  next: {
    clientPrefix: 'NEXT_PUBLIC_',
    runtimeEnv: 'process.env',
    allowedEnvironments: ['node', 'edge'],
  },
  remix: {
    clientPrefix: 'PUBLIC_',
    runtimeEnv: 'process.env',
    allowedEnvironments: ['node', 'browser'],
  },
  react: {
    clientPrefix: 'REACT_APP_',
    runtimeEnv: 'process.env',
    allowedEnvironments: ['browser'],
  },
  vue: {
    clientPrefix: 'VITE_',
    runtimeEnv: 'import.meta.env',
    allowedEnvironments: ['browser'],
  },
  solid: {
    clientPrefix: 'VITE_',
    runtimeEnv: 'import.meta.env',
    allowedEnvironments: ['browser'],
  },
  nx: {
    clientPrefix: 'NX_PUBLIC_',
    runtimeEnv: 'process.env',
    allowedEnvironments: ['node', 'browser'],
    defaultValidation: true,
    envFilePath: ['apps/${project}/.env', 'libs/${workspace}/.env'],
  },
  nuxt: {
    clientPrefix: 'NUXT_PUBLIC_',
    runtimeEnv: 'process.env',
    allowedEnvironments: ['node', 'browser'],
    defaultValidation: true,
  },
} ;

interface MonorepoConfig {
  project?: string;
  workspace?: string;
  envFilePath?: string | string[];
  shared?: boolean;
}

export interface EnvValidatorOptions<
  TServerSchema extends Record<string, ZodType>,
  TClientSchema extends Record<string, ZodType>,
  TSharedSchema extends Record<string, ZodType>
> {
  server?: TServerSchema;
  client?: TClientSchema;
  shared?: TSharedSchema;
  clientPrefix?: string;
  runtimeEnv?: Record<string, unknown>;
  framework?: SupportedFrameworks;
  emptyStringAsUndefined?: boolean;
  allowedEnvironments?: RuntimeEnvironment[];
  onValidationError?: (error: ZodError) => never;
  onInvalidAccess?: (variable: string, context: string) => never;
  monorepo?: MonorepoConfig;
  loadEnvFiles?: boolean;
  transformers?: Record<string, EnvTransformer>;
}

export type EnvTransformer = (value: unknown, key: string) => unknown;

export class EnvValidator<
  TServerSchema extends Record<string, ZodType>,
  TClientSchema extends Record<string, ZodType>,
  TSharedSchema extends Record<string, ZodType>
> {
  private serverSchema: z.ZodObject<TServerSchema>;
  private clientSchema: z.ZodObject<TClientSchema>;
  private sharedSchema: z.ZodObject<TSharedSchema>;
  private options: Required<EnvValidatorOptions<TServerSchema, TClientSchema, TSharedSchema>>;
  private validationResult: ValidationResult | null = null;

  constructor(options: EnvValidatorOptions<TServerSchema, TClientSchema, TSharedSchema>) {
    const frameworkConfig = options.framework ? FRAMEWORK_CONFIGS[options.framework] : null;

    this.options = {
      server: options.server ?? ({} as TServerSchema),
      client: options.client ?? ({} as TClientSchema),
      shared: options.shared ?? ({} as TSharedSchema),
      clientPrefix: options.clientPrefix ?? frameworkConfig?.clientPrefix ?? '',
      runtimeEnv: options.runtimeEnv ?? this.detectRuntimeEnv(),
      framework: options.framework ?? 'custom',
      emptyStringAsUndefined: options.emptyStringAsUndefined ?? true,
      allowedEnvironments: options.allowedEnvironments ?? frameworkConfig?.allowedEnvironments ?? ['node', 'edge', 'browser', 'deno'],
      onValidationError: options.onValidationError ?? this.defaultValidationError,
      onInvalidAccess: options.onInvalidAccess ?? this.defaultInvalidAccess,
      monorepo: options.monorepo ?? {},
      loadEnvFiles: options.loadEnvFiles || false,
      transformers: options.transformers ?? {},
    };

    this.serverSchema = z.object(this.options.server);
    this.clientSchema = z.object(this.options.client);
    this.sharedSchema = z.object(this.options.shared);

    this.validateClientPrefix();
  }

  private detectRuntimeEnv(): Record<string, unknown> {
    let env: Record<string, unknown> = {};

    if (typeof process !== 'undefined' && process.env) {
      env = { ...env, ...process.env };
    }

    if (typeof import.meta !== 'undefined' && 'env' in import.meta) {
      env = { ...env, ...import.meta.env };
    }

    if (typeof Deno !== 'undefined' && 'env' in Deno) {
      env = { ...env, ...Deno.env.toObject() };
    }

    if (typeof globalThis !== 'undefined' && 'ENV' in globalThis) {
      env = { ...env, ...(globalThis as any).ENV };
    }

    return env;
  }

  private getCurrentEnvironment(): RuntimeEnvironment {
    if (typeof Deno !== 'undefined' && 'env' in Deno) return 'deno';
    if (typeof window !== 'undefined') return 'browser';
    if (typeof EdgeRuntime !== 'undefined') return 'edge';
    return 'node';
  }

  private validateClientPrefix() {
    if (this.options.clientPrefix) {
      Object.keys(this.options.client).forEach(key => {
        if (!key.startsWith(this.options.clientPrefix)) {
          console.warn(`Skipping improperly prefixed client variable: "${key}"`);
          throw new Error(
            `Client environment variable "${key}" must be prefixed with "${this.options.clientPrefix}"`
          );
        }
      });
    }
  }

  private defaultValidationError(error: unknown): never {
    console.error('❌ Validation error:', error);

    if (error instanceof z.ZodError) {
      console.error('Zod error details:', error.flatten().fieldErrors);
    } else if (error instanceof Error) {
      console.error('General error message:', error.message);
    } else {
      console.error('Unknown error type');
    }

    throw new Error('Environment validation failed.');
  }

  private defaultInvalidAccess(variable: string, context: string): never {
    throw new Error(
      `❌ Attempted to access ${context} environment variable "${variable}" in invalid context`
    );
  }

  private transformEnv(env: Record<string, unknown>): Record<string, unknown> {
    const transformed = { ...env };

    if (this.options.emptyStringAsUndefined) {
      Object.entries(transformed).forEach(([key, value]) => {
        if (value === '') {
          transformed[key] = undefined;
        }
      });
    }

    // Apply custom transformers
    if (this.options.transformers) {
      Object.entries(transformed).forEach(([key, value]) => {
        if (key in this.options.transformers!) {
          transformed[key] = this.options?.transformers?.[key]?.(value, key);
        }
      });
    }

    return transformed;
  }

  private validateAccess(key: string): void {
    const environment = this.getCurrentEnvironment();
    
    // Check if the variable is server-only (not in client or shared schemas)
    const isServerVar = key in this.options.server && 
      !(key in this.options.client) && 
      !(key in this.options.shared);

    if (isServerVar && environment === 'browser') {
      this.options.onInvalidAccess(key, environment);
    }
  }

  public parse() {
    const currentEnv = this.getCurrentEnvironment();
    const isServer = currentEnv !== 'browser';

    if (!this.options.allowedEnvironments.includes(currentEnv)) {
      throw new Error(
        `Environment "${currentEnv}" is not allowed. Allowed environments: ${this.options.allowedEnvironments.join(
          ', '
        )}`
      );
    }

    const transformedEnv = this.transformEnv(this.options.runtimeEnv);

    const schema = isServer
      ? this.serverSchema.merge(this.clientSchema).merge(this.sharedSchema)
      : this.clientSchema.merge(this.sharedSchema);

    const result = schema.safeParse(transformedEnv);

    if (!result.success) {
      return this.options.onValidationError(result.error);
    }

    this.validationResult = { success: true };

    type EnvOutput<T> = {
      [K in keyof T]: T[K] extends ZodType ? z.infer<T[K]> : never;
    };

    return new Proxy(result.data, {
      get: (target: Record<string, unknown>, prop: string) => {
        this.validateAccess(prop);
        return target[prop];
      },
    }) as EnvOutput<TServerSchema & TClientSchema & TSharedSchema>;
  }

  public getValidationState(): ValidationResult {
    if (!this.validationResult) {
      try {
        this.parse(); // Attempt parsing, which triggers validation
      } catch (error: unknown) {
        if (error instanceof z.ZodError) {
          this.validationResult = {
            success: false,
            errors: error.errors.map((err) => ({
              path: err.path.map(String),
              message: err.message,
            })),
          };
        } else if (error instanceof Error) {
          this.validationResult = {
            success: false,
            errors: [{ path: [], message: error.message || 'Unknown error occurred' }],
          };
        } else {
          this.validationResult = {
            success: false,
            errors: [{ path: [], message: 'An unexpected validation error occurred' }],
          };
        }
      }
    }
    return this.validationResult ?? { success: true, errors: [] };
  }

  public setRuntimeEnv(env: Record<string, unknown>): void {
    this.options.runtimeEnv = this.transformEnv(env);
    this.validationResult = null; // Reset validation state
  }
}

export function createEnvValidator<
  TServerSchema extends Record<string, ZodType>,
  TClientSchema extends Record<string, ZodType>,
  TSharedSchema extends Record<string, ZodType>
>(
  options: EnvValidatorOptions<TServerSchema, TClientSchema, TSharedSchema>
) {
  return new EnvValidator(options);
}
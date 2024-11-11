declare global {
  // For Edge Runtime
  const EdgeRuntime: string | undefined;

  // For Deno
  const Deno:
    | {
        env: {
          get(key: string): string | undefined;
          toObject(): Record<string, string>;
        };
      }
    | undefined;

  // For import.meta
  interface ImportMeta {
    readonly env: Record<string, string | undefined>;
  }
}

export {};

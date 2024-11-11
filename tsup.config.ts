import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: true,
  metafile: true,
  esbuildOptions(options) {
    options.footer = {
      // Prevent IIFE from leaking variables in CJS builds
      js: "if (exports.default) { Object.defineProperty(exports.default, '__esModule', { value: true }); }",
    };
  },
  // Environment variables to define
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'deployment'),
  },
});

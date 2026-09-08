import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    // Keep SVG-heavy fixture tests from starving interactive UI assertions.
    maxWorkers: 2,
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'tests/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/pages/ChartV2/model/**/*.{ts,tsx}',
        'src/services/**/*.ts',
      ],
    },
  },
});

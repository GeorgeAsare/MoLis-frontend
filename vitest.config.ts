import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // '@/' maps to 'src/' as defined in tsconfig.json paths.
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'validation/**/*.test.ts'],
    // 'server-only' is a Next.js guard that throws in browser bundles.
    // In the Vitest node environment it is safe to treat it as an empty module.
    alias: {
      'server-only': '/dev/null',
    },
  },
})

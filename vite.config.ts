import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'development-refresh-csp',
      transformIndexHtml(html, context) {
        // Vite injects an inline refresh preamble only in development. Packaged
        // builds retain the strict, self-only production script policy.
        return context.server
          ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
          : html;
      },
    },
  ],
  base: './',
});

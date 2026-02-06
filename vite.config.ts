import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts'],
    }),
  ],
  build: {
    lib: {
      entry: {
        picscrub: resolve(__dirname, 'src/index.ts'),
        'picscrub.heic': resolve(__dirname, 'src/formats/heic.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        const ext = format === 'es' ? 'js' : 'cjs';
        return `${entryName}.${ext}`;
      },
    },
    rollupOptions: {
      external: [],
      output: {
        preserveModules: false,
        exports: 'named',
      },
    },
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2022',
  },
});

// ESLint configuration for the whole monorepo (flat config format).
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/dist/**', '**/coverage/**']),

  js.configs.recommended,

  // Type-aware rules: they use the TypeScript compiler, so they can catch
  // things like a Promise that is never awaited (no-floating-promises).
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Plain JS config files are not part of any tsconfig.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Security rules required by the project (CLAUDE.md → "Kod kalitesi").
  {
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is forbidden: render untrusted content as text.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'vm', message: 'Running user code is forbidden.' },
            { name: 'node:vm', message: 'Running user code is forbidden.' },
          ],
        },
      ],
    },
  },

  // Backend + Vite config: Node environment.
  {
    files: ['server/**/*.ts', 'client/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // Browser code: React rules.
  {
    files: ['client/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
]);

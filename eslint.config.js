// @ts-check

import payloadEsLintConfig from '@payloadcms/eslint-config'

export const defaultESLintIgnores = [
  '**/.temp',
  '**/.*', // ignore all dotfiles
  'scripts/consumer-smoke/template/**', // standalone consumer app; resolved only after the smoke install
  '**/.git',
  '**/.hg',
  '**/.pnp.*',
  '**/.svn',
  '**/playwright.config.ts',
  '**/vitest.config.js',
  '**/tsconfig.tsbuildinfo',
  '**/README.md',
  '**/eslint.config.js',
  '**/payload-types.ts',
  '**/dist/',
  '**/.yarn/',
  '**/build/',
  '**/node_modules/',
  '**/temp/',
]

export default [
  {
    ignores: defaultESLintIgnores,
  },
  ...payloadEsLintConfig,
  {
    rules: {
      'no-restricted-exports': 'off',
    },
  },
  {
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
        projectService: {
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 40,
          allowDefaultProject: [
            'scripts/*.ts',
            'tools/dev/*.mjs',
            'scripts/consumer-smoke/*.mjs',
            '*.js',
            '*.mjs',
            '*.spec.ts',
            '*.d.ts',
          ],
        },
        // projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]

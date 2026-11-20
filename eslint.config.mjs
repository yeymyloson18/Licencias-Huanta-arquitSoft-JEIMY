// Configuración de ESLint del monorepo (constitución, principio IV: TypeScript estricto, sin `any`).
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'packages/contracts/src/generado/**',
      'apps/api/test/regla-dependencia/fixtures/**',
      'docs/**',
      'specs/**',
      'tecnologia/**',
      '.specify/**',
      '.claude/**',
      'tests/e2e/informe/**',
      'tests/e2e/resultados/**',
    ],
  },
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Los módulos de NestJS son clases vacías con decorador (@Module).
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    // Pruebas de extremo a extremo (007): fuera del typecheck de apps/*, con su propio tsconfig.
    files: ['tests/e2e/**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tests/e2e/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);

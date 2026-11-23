import type { Config } from 'jest';

// Pruebas del portal con Jest + jsdom + Testing Library (constitución, principio V; research.md §R-11).
const config: Config = {
  testEnvironment: '<rootDir>/jest.entorno.cjs',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  // 008: reporte publicado por el job `cobertura` del CI (sin umbral para el portal).
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/src/__mocks__/estilo.ts',
  },
};

export default config;

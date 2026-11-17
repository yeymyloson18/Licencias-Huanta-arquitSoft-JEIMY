import type { Config } from 'jest';

// Dos proyectos: pruebas unitarias (sin base ni red) e integración (Supertest con PostgreSQL y Redis).
// La cobertura se mide con `npm run cobertura` (solo el proyecto unit), research.md §R-11.
const transform: Config['transform'] = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
};

const config: Config = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
      testPathIgnorePatterns: ['/node_modules/', '/fixtures/'],
      transform,
    },
    {
      displayName: 'integracion',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/integracion/**/*.e2e-spec.ts'],
      transform,
      testTimeout: 15000,
    },
  ],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    './src/**/dominio/**/*.ts': { lines: 80, branches: 80 },
    './src/**/aplicacion/**/*.ts': { lines: 80, branches: 80 },
  },
};

export default config;

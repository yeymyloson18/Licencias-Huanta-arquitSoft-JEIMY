import type { Config } from 'jest';

// Pruebas del portal con Jest + jsdom + Testing Library (constitución, principio V; research.md §R-11).
const config: Config = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  moduleNameMapper: {
    '\\.css$': '<rootDir>/src/__mocks__/estilo.ts',
  },
};

export default config;

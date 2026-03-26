module.exports = {
  forceExit: true,
  testTimeout: 10000,
  projects: [
    {
      displayName: 'engine',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/gameEngine', '<rootDir>/tests/services', '<rootDir>/tests/ble', '<rootDir>/tests/persistence', '<rootDir>/tests/integration', '<rootDir>/tests/bot'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
      transform: {
        '^.+\\.tsx?$': 'ts-jest',
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    },
    {
      displayName: 'ui',
      preset: 'react-native',
      roots: ['<rootDir>/tests/ui', '<rootDir>/tests/hooks', '<rootDir>/src'],
      setupFiles: ['<rootDir>/tests/ui/setup.js'],
      setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect', '<rootDir>/tests/ui/setupAfterEnv.js'],
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*)',
      ],
    },
  ],
};

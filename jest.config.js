module.exports = {
  projects: [
    {
      displayName: 'engine',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/gameEngine', '<rootDir>/tests/services'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
      transform: {
        '^.+\\.tsx?$': 'ts-jest',
      },
    },
    {
      displayName: 'ui',
      preset: 'react-native',
      roots: ['<rootDir>/tests/ui', '<rootDir>/src'],
      setupFiles: ['<rootDir>/tests/ui/setup.js'],
      setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*)',
      ],
    },
  ],
};

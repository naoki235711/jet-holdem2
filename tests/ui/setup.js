// Mock react-native Modal to avoid @react-native/virtualized-lists resolution issue
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, ...props }) => React.createElement(View, props, children),
  };
});

// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': 'babel-jest',
  },
  transformIgnorePatterns: [
    // This pattern means: ignore node_modules EXCEPT specified packages
    "node_modules/(?!(@babel/runtime|jest-runtime|open|inquirer|is-wsl|is-inside-container|is-docker|define-lazy-prop|default-browser|default-browser-id|bundle-name|run-applescript)/)",
    "\\.pnp\\.[^\\/]+$"
  ],
  // moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'], // Default is usually fine
};

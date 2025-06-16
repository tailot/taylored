// babel.config.js
module.exports = {
  presets: [
    ['@babel/preset-env', {targets: {node: 'current'}}],
  ],
  plugins: [
    'babel-plugin-transform-import-meta' // Add this plugin
  ]
};

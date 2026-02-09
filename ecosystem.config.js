module.exports = {
  apps: [
    {
      name: 'rebel-exchchange',
      script: 'dist/src/main.js',
      wait_ready: true,
      kill_timeout: 300000,
    },
  ],
};

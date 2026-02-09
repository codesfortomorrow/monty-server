module.exports = {
  apps: [
    {
      name: 'monty-server',
      script: 'dist/src/main.js',
      wait_ready: true,
      kill_timeout: 300000,
    },
  ],
};

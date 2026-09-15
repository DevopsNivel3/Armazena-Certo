module.exports = {
  apps: [
    {
      name: 'armazena-backend',
      script: 'server.js',
      cwd: './backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3408
      }
    }
  ],
  static: [
    {
      name: 'armazena-frontend',
      path: './frontend/dist',
      port: 3401,
      spa: true
    }
  ]
};

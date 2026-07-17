module.exports = {
  apps: [
    {
      name: 'kmb-api',
      cwd: '/var/www/ecommerce/apps/api',
      script: 'dist/main.js',
      instances: 2,
      autorestart: true,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'kmb-dashboard',
      cwd: '/var/www/ecommerce/apps/dashboard',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3001',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
    },
  ],
};
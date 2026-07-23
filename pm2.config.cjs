// PM2 process manager config for mycompound — runs the HTTP server (cluster mode)
// and the BullMQ worker (fork mode, recommended for background job processing).
// Logs are stored in /var/log/pm2.
module.exports = {
  apps: [
    {
      name: 'mycompound-server',
      script: 'dist/server.mjs',
      instances: 1, // capped for 512MB-1GB droplet — raise only if you upgrade RAM/CPU
      exec_mode: 'cluster',
      env_file: '/home/deploy/deploy/apps/mycompound/.env',
      env: {
        NODE_ENV: 'staging',
        PORT: 8000,
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      out_file: '/var/log/pm2/mycompound-server-out.log',
      error_file: '/var/log/pm2/mycompound-server-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
    {
      name: 'mycompound-worker',
      script: 'dist/worker.mjs',
      instances: 1,
      exec_mode: 'fork',
      env_file: '/home/deploy/deploy/apps/mycompound/.env',
      env: {
        NODE_ENV: 'staging',
      },
      kill_timeout: 30000,
      stop_exit_codes: [0],
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      out_file: '/var/log/pm2/mycompound-worker-out.log',
      error_file: '/var/log/pm2/mycompound-worker-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};

/**
 * PM2 process definition for the sandbox preview.
 *
 * `wrangler pages dev` serves the already-built `dist/` directory (run
 * `npm run build` first — it is not a watch server). The dataset is compiled
 * into the Worker, so there is no D1/KV/R2 flag and no binding to initialise.
 */
module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'npx',
      args: 'wrangler pages dev dist --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
}

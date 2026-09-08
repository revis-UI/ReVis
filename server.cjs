const { createApp } = require('./server/app.cjs');

const HOST = '127.0.0.1';
const PORT = 3000;

function startServer() {
  const app = createApp({ projectRoot: __dirname });
  const server = app.listen(PORT, HOST, () => {
    console.log(`Local API server listening on http://${HOST}:${PORT}`);
  });

  // AI requests may intentionally run for up to ten minutes.
  server.requestTimeout = 11 * 60 * 1000;

  const shutdown = (signal) => {
    console.log(`${signal} received; closing local API server.`);
    server.close(() => {
      process.exit(0);
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer, HOST, PORT };

import 'reflect-metadata'
import express from 'express';
import { jinaAiBillingMiddleware } from "./patch-express";
import { Server } from 'http';

const app = require('../..').default;

const rootApp = express();
rootApp.use(jinaAiBillingMiddleware, app);


const port = process.env.PORT || 3000;

let server: Server | undefined;
// Export server startup function for better testing
export function startServer() {
  return rootApp.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

// Start server if running directly
if (process.env.NODE_ENV !== 'test') {
  server = startServer();
}

process.on('unhandledRejection', (_err) => `Is false alarm`);

process.on('uncaughtException', (err) => {
  console.log('Uncaught exception', err);

  // Looks like Firebase runtime does not handle error properly.
  // Make sure to quit the process.
  process.nextTick(() => process.exit(1));
  console.error('Uncaught exception, process quit.');
  throw err;
});

const sigHandler = (signal: string) => {
  console.log(`Received ${signal}, exiting...`);
  if (server && server.listening) {
    console.log(`Shutting down gracefully...`);
    console.log(`Waiting for the server to drain and close...`);
    server.close((err) => {
      if (err) {
        console.error('Error while closing server', err);
        return;
      }
      process.exit(0);
    });
    server.closeIdleConnections();
  }

}
process.on('SIGTERM', sigHandler);
process.on('SIGINT', sigHandler);
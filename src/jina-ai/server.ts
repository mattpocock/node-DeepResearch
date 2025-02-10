import 'reflect-metadata'
import app from "../app";
import express from 'express';
import { jinaAiBillingMiddleware } from "./patch-express";


const rootApp = express();
rootApp.use(jinaAiBillingMiddleware, app);


const port = process.env.PORT || 3000;

// Export server startup function for better testing
export function startServer() {
  return rootApp.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

// Start server if running directly
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
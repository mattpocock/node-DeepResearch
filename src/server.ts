import app from './app';

const port = process.env.PORT || 3000;

// Export server startup function for better testing
export function startServer() {
  return app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

// Start server if running directly
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

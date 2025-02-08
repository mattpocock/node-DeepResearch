import { getResponse } from '../agent';

describe('getResponse', () => {
  const requiredEnvVars = ['GOOGLE_API_KEY', 'JINA_API_KEY'];
  
  beforeAll(() => {
    const missingVars = requiredEnvVars.filter(key => !process.env[key]);
    if (missingVars.length > 0) {
      console.warn(`Skipping tests: missing required env vars: ${missingVars.join(', ')}`);
      process.env.SKIP_INTEGRATION = 'true';
    }
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should handle search action', async () => {
    if (process.env.SKIP_INTEGRATION) {
      console.warn('Skipping integration test: missing required env vars');
      return;
    }
    
    const result = await getResponse('What is TypeScript?', 10000);
    expect(result.result.action).toBeDefined();
    expect(result.context).toBeDefined();
    expect(result.context.tokenTracker).toBeDefined();
    expect(result.context.actionTracker).toBeDefined();
  }, 30000);
});

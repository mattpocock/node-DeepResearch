import { getResponse } from '../agent';

jest.setTimeout(10000);

describe('getResponse', () => {
  it('should handle search action', async () => {
    const result = await getResponse('What is TypeScript?', 1000);
    expect(result.result.action).toBeDefined();
    expect(result.context).toBeDefined();
    expect(result.context.tokenTracker).toBeDefined();
    expect(result.context.actionTracker).toBeDefined();
  });
});

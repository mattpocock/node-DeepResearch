import { analyzeSteps } from '../error-analyzer';
import { setupTestLLMConfig } from './test-helpers';

describe('analyzeSteps', () => {
  beforeEach(() => {
    setupTestLLMConfig();
  });
  it('should analyze error steps', async () => {
    const { response } = await analyzeSteps(['Step 1: Search failed', 'Step 2: Invalid query']);
    expect(response).toHaveProperty('recap');
    expect(response).toHaveProperty('blame');
    expect(response).toHaveProperty('improvement');
  });
});

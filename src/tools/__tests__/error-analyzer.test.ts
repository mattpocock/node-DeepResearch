import { analyzeSteps } from '../error-analyzer';
import { MockLLMClient } from './utils/llm-mock';
import { TEST_RESPONSES } from './utils/test-config';

jest.mock('../../config', () => ({
  ...jest.requireActual('../../config'),
  llmClient: new MockLLMClient(TEST_RESPONSES.errorAnalyzer)
}));

describe('analyzeSteps', () => {
  it('should analyze error steps', async () => {
    const { response } = await analyzeSteps(['Step 1: Search failed', 'Step 2: Invalid query']);
    expect(response).toHaveProperty('recap');
    expect(response).toHaveProperty('blame');
    expect(response).toHaveProperty('improvement');
  });
});

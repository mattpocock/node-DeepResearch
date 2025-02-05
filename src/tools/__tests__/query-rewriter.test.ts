import { rewriteQuery } from '../query-rewriter';
import { MockLLMClient } from './utils/llm-mock';
import { TEST_RESPONSES } from './utils/test-config';
import * as config from '../../config';

jest.mock('../../config', () => ({
  ...jest.requireActual('../../config'),
  llmClient: new MockLLMClient(TEST_RESPONSES.queryRewriter)
}));

describe('rewriteQuery', () => {
  it('should rewrite search query', async () => {
    const { queries } = await rewriteQuery({
      action: 'search',
      searchQuery: 'how does typescript work',
      think: 'Understanding TypeScript basics'
    });
    expect(Array.isArray(queries)).toBe(true);
    expect(queries.length).toBeGreaterThan(0);
  });
});

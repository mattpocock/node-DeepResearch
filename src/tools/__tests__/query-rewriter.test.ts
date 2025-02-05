import { rewriteQuery } from '../query-rewriter';
import { setupTestLLMConfig } from './test-helpers';

describe('rewriteQuery', () => {
  beforeEach(() => {
    setupTestLLMConfig();
  });
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

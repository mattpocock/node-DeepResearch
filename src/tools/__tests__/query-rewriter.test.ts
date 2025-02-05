import { rewriteQuery } from '../query-rewriter';

jest.setTimeout(10000);

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

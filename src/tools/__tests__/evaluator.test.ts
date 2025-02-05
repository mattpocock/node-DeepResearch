import { evaluateAnswer } from '../evaluator';
import { TokenTracker } from '../../utils/token-tracker';
import { MockLLMClient } from './utils/llm-mock';
import { TEST_RESPONSES } from './utils/test-config';

jest.mock('../../config', () => ({
  ...jest.requireActual('../../config'),
  llmClient: new MockLLMClient(TEST_RESPONSES.evaluator)
}));

describe('evaluateAnswer', () => {
  it('should evaluate answer definitiveness', async () => {
    const tokenTracker = new TokenTracker();
    const { response } = await evaluateAnswer(
      'What is TypeScript?',
      'TypeScript is a strongly typed programming language that builds on JavaScript.',
      tokenTracker
    );
    expect(response).toHaveProperty('is_definitive');
    expect(response).toHaveProperty('reasoning');
  });
});

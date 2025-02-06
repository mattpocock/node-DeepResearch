import { evaluateAnswer } from '../evaluator';
import { TokenTracker } from '../../utils/token-tracker';
import { LLMProvider } from '../../config';

describe('evaluateAnswer', () => {
  const providers: Array<LLMProvider> = ['openai', 'gemini'];
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  providers.forEach(provider => {
    describe(`with ${provider} provider`, () => {
      beforeEach(() => {
        process.env.LLM_PROVIDER = provider;
      });

      it('should evaluate answer definitiveness', async () => {
        const tokenTracker = new TokenTracker();
        const { response } = await evaluateAnswer(
          'What is TypeScript?',
          'TypeScript is a strongly typed programming language that builds on JavaScript.',
          ['definitive'],
          tokenTracker
        );
        expect(response).toHaveProperty('pass');
        expect(response).toHaveProperty('think');
        expect(response.type).toBe('definitive');
        expect(response.pass).toBe(true);
      });

      it('should evaluate answer freshness', async () => {
        const tokenTracker = new TokenTracker();
        const { response } = await evaluateAnswer(
          'What is the latest version of Node.js?',
          'The latest version of Node.js is 14.0.0, released in April 2020.',
          ['freshness'],
          tokenTracker
        );
        expect(response).toHaveProperty('pass');
        expect(response).toHaveProperty('think');
        expect(response.type).toBe('freshness');
        expect(response.freshness_analysis).toBeDefined();
        expect(response.freshness_analysis?.likely_outdated).toBe(true);
        expect(response.freshness_analysis?.dates_mentioned).toContain('2020-04');
        expect(response.freshness_analysis?.current_time).toBeDefined();
        expect(response.pass).toBe(false);
      });

      it('should evaluate answer plurality', async () => {
        const tokenTracker = new TokenTracker();
        const { response } = await evaluateAnswer(
          'List three programming languages.',
          'Python is a programming language.',
          ['plurality'],
          tokenTracker
        );
        expect(response).toHaveProperty('pass');
        expect(response).toHaveProperty('think');
        expect(response.type).toBe('plurality');
        expect(response.plurality_analysis).toBeDefined();
        expect(response.plurality_analysis?.expects_multiple).toBe(true);
        expect(response.plurality_analysis?.provides_multiple).toBe(false);
        expect(response.plurality_analysis?.count_expected).toBe(3);
        expect(response.plurality_analysis?.count_provided).toBe(1);
        expect(response.pass).toBe(false);
      });

      it('should evaluate in order and stop at first failure', async () => {
        const tokenTracker = new TokenTracker();
        const { response } = await evaluateAnswer(
          'List the latest Node.js versions.',
          'I am not sure about the Node.js versions.',
          ['definitive', 'freshness', 'plurality'],
          tokenTracker
        );
        expect(response.type).toBe('definitive');
        expect(response.pass).toBe(false);
        expect(response.freshness_analysis).toBeUndefined();
        expect(response.plurality_analysis).toBeUndefined();
      });

      it('should track token usage', async () => {
        const tokenTracker = new TokenTracker();
        const spy = jest.spyOn(tokenTracker, 'trackUsage');
        await evaluateAnswer(
          'What is TypeScript?',
          'TypeScript is a strongly typed programming language that builds on JavaScript.',
          ['definitive', 'freshness', 'plurality'],
          tokenTracker
        );
        expect(spy).toHaveBeenCalledWith('evaluator', expect.any(Number));
      });
    });
  });
});

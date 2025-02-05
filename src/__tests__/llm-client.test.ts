import { GoogleAIWrapper, LocalLLMClient } from '../utils/llm-client';

describe('LLM Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use GoogleAIWrapper by default', async () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    const config = await import('../config');
    expect(config.llmClient).toBeInstanceOf(GoogleAIWrapper);
  });

  it('should use LocalLLMClient when configured', async () => {
    process.env.LLM_PROVIDER = 'local';
    process.env.LOCAL_LLM_HOSTNAME = 'localhost';
    process.env.LOCAL_LLM_PORT = '8000';
    process.env.LOCAL_LLM_MODEL = 'test-model';
    const config = await import('../config');
    expect(config.llmClient).toBeInstanceOf(LocalLLMClient);
  });
});

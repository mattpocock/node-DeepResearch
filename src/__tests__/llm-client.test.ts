import { GoogleAIWrapper, LocalLLMClient } from '../utils/llm-client';
import { llmClient } from '../config';

jest.mock('../config', () => {
  let mockConfig = { llmClient: null };
  return {
    get llmClient() {
      return mockConfig.llmClient;
    },
    __setMockConfig: (config: { llmClient: any }) => {
      mockConfig = config;
    }
  };
});

describe('LLM Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use GoogleAIWrapper by default', () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    jest.isolateModules(() => {
      const { llmClient } = require('../config');
      expect(llmClient).toBeInstanceOf(GoogleAIWrapper);
    });
  });

  it('should use LocalLLMClient when configured', () => {
    process.env.LLM_PROVIDER = 'local';
    process.env.LOCAL_LLM_HOSTNAME = 'localhost';
    process.env.LOCAL_LLM_PORT = '8000';
    process.env.LOCAL_LLM_MODEL = 'test-model';
    jest.isolateModules(() => {
      const { llmClient } = require('../config');
      expect(llmClient).toBeInstanceOf(LocalLLMClient);
    });
  });
});

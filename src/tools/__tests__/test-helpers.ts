import { llmConfig } from '../../config';

export const setupTestLLMConfig = () => {
  // Reset provider to gemini for tests
  llmConfig.provider = 'gemini';
  
  // Clear any OpenAI-specific env vars that might affect tests
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
};

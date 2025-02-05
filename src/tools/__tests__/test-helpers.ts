import { llmConfig } from '../../config';

export const setupTestLLMConfig = () => {
  llmConfig.provider = 'gemini';
  delete llmConfig.baseURL;
  delete llmConfig.model;
};

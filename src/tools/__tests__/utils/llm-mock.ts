import { LLMClient, LLMClientConfig } from '../../../utils/llm-client';

export class MockLLMClient implements LLMClient {
  constructor(private mockResponse: string = '{"queries": ["test query"]}') {}

  getGenerativeModel(config: LLMClientConfig) {
    return {
      generateContent: async () => ({
        response: {
          text: () => this.mockResponse,
          usageMetadata: { totalTokenCount: 100 }
        }
      })
    };
  }
}

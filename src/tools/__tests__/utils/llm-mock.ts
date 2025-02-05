import { LLMClient, LLMClientConfig } from '../../../utils/llm-client';

export class MockLLMClient implements LLMClient {
  constructor(private mockResponse: string = '{"queries": ["test query"]}') {}

  // eslint-disable-next-line @typescript-eslint/no-unused-params
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

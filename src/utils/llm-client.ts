import { GoogleGenerativeAI } from '@google/generative-ai';

export interface LLMClientConfig {
  model: string;
  temperature: number;
  generationConfig?: {
    responseMimeType?: string;
    responseSchema?: any;
  };
}

export interface LLMResponse {
  text(): string;
  usageMetadata: {
    totalTokenCount: number;
  };
}

export interface LLMClient {
  getGenerativeModel(config: LLMClientConfig): {
    generateContent(prompt: string): Promise<{
      response: LLMResponse;
    }>;
  };
}

export class GoogleAIWrapper implements LLMClient {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  getGenerativeModel(config: LLMClientConfig) {
    const model = this.client.getGenerativeModel({
      model: config.model,
      generationConfig: {
        temperature: config.temperature,
        ...(config.generationConfig || {})
      }
    });

    return {
      generateContent: async (prompt: string) => {
        const result = await model.generateContent(prompt);
        return {
          response: {
            text: () => result.response.text(),
            usageMetadata: {
              totalTokenCount: result.response.usageMetadata?.totalTokenCount ?? 0
            }
          }
        };
      }
    };
  }
}

export class LocalLLMClient implements LLMClient {
  constructor(
    private hostname: string,
    private port: string,
    private model: string
  ) {}

  getGenerativeModel(config: LLMClientConfig) {
    return {
      generateContent: async (prompt: string) => {
        const response = await fetch(`http://${this.hostname}:${this.port}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: config.temperature,
            response_format: {
              type: 'json_schema',
              json_schema: config.generationConfig?.responseSchema,
            },
            max_tokens: 8192,
            stream: false,
          }),
        });

        const data = await response.json();
        return {
          response: {
            text: () => data.choices[0].message.content,
            usageMetadata: {
              totalTokenCount: data.usage?.total_tokens || 0,
            },
          },
        };
      },
    };
  }
}

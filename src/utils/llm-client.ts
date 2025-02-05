import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { GEMINI_API_KEY, OPENAI_API_KEY, llmConfig } from '../config';

interface LLMClientOptions {
  model: string;
  temperature: number;
  generationConfig?: {
    responseMimeType?: string;
    responseSchema?: any;
  };
}

export class LLMClient {
  private geminiClient: GoogleGenerativeAI;
  private openaiClient: OpenAI;
  
  constructor() {
    this.geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
    if (llmConfig.provider === 'openai') {
      this.openaiClient = new OpenAI({
        apiKey: OPENAI_API_KEY,
        baseURL: llmConfig.baseURL
      });
    }
  }

  async generateContent(model: any, prompt: string) {
    if (llmConfig.provider === 'gemini') {
      const result = await model.generateContent(prompt);
      return result;
    } else if (this.openaiClient) {
      const completion = await model.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: model.temperature,
        response_format: { type: "json" }
      });
      return {
        response: {
          text: () => completion.choices[0].message.content,
          usageMetadata: {
            totalTokenCount: completion.usage?.total_tokens
          }
        }
      };
    }
    throw new Error('OpenAI client not initialized. Set OPENAI_API_KEY and provider="openai" to use OpenAI.');
  }

  getModel(options: LLMClientOptions) {
    if (llmConfig.provider === 'gemini') {
      return this.geminiClient.getGenerativeModel(options);
    } else if (this.openaiClient) {
      return {
        ...this.openaiClient.chat.completions,
        temperature: options.temperature,
        generateContent: (prompt: string) => this.generateContent(this.openaiClient.chat.completions, prompt)
      };
    }
    throw new Error('OpenAI client not initialized. Set OPENAI_API_KEY and provider="openai" to use OpenAI.');
  }
}

export const llmClient = new LLMClient();

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import {GEMINI_API_KEY, OPENAI_API_KEY, llmConfig, OPENAI_DEFAULT_MODEL, OPENAI_BASE_URL} from '../config';

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
  private openaiClient?: OpenAI;
  
  constructor() {
    this.geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
    if (llmConfig.provider === 'openai') {
      const config: { apiKey: string; baseURL?: string } = {
        apiKey: OPENAI_API_KEY || 'ollama'
      };
      if (OPENAI_BASE_URL) {
        config.baseURL = OPENAI_BASE_URL;
      }
      this.openaiClient = new OpenAI(config);
    }
  }

  async generateContent(model: any, prompt: string) {
    if (llmConfig.provider === 'gemini') {
      return await model.generateContent(prompt);
    } else if (this.openaiClient) {
      const completion = await model.create({
        model: OPENAI_DEFAULT_MODEL,
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
      const client = this.openaiClient;
      if (!client) {
        throw new Error('OpenAI client not initialized. Set OPENAI_API_KEY and provider="openai" to use OpenAI.');
      }
      return {
        ...client.chat.completions,
        temperature: options.temperature,
        generateContent: (prompt: string) => this.generateContent(client.chat.completions, prompt)
      };
    }
    throw new Error('OpenAI client not initialized. Set OPENAI_API_KEY and provider="openai" to use OpenAI.');
  }
}

export const llmClient = new LLMClient();

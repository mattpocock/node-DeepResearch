import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import type { ProviderConfig } from '../types';
import { GEMINI_API_KEY, OPENAI_API_KEY, aiConfig } from '../config';

const defaultConfig = aiConfig.providers[aiConfig.defaultProvider];

export interface GeminiProvider {
  generateContent(params: {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    generationConfig?: {
      temperature?: number;
      maxOutputTokens?: number;
    };
  }): Promise<{
    response: {
      text(): string;
      usageMetadata?: { totalTokenCount?: number };
    };
  }>;
}

export type OpenAIProvider = OpenAI;

export type AIProvider = GeminiProvider | OpenAIProvider;

export function isGeminiProvider(provider: AIProvider): provider is GeminiProvider {
  return 'generateContent' in provider;
}

export function isOpenAIProvider(provider: AIProvider): provider is OpenAIProvider {
  return 'chat' in provider;
}

export class ProviderFactory {
  private static geminiClient: GoogleGenerativeAI | null = null;
  private static openaiClient: OpenAI | null = null;

  static createProvider(config: ProviderConfig = defaultConfig): AIProvider {
    switch (config.type) {
      case 'gemini': {
        if (!this.geminiClient) {
          this.geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
        }
        return this.geminiClient.getGenerativeModel({
          model: config.model,
          generationConfig: {
            temperature: config.temperature
          }
        });
      }
      case 'openai': {
        if (!this.openaiClient) {
          this.openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
        }
        return this.openaiClient;
      }
      case 'ollama':
        throw new Error('Ollama support coming soon');
      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }
  }
}

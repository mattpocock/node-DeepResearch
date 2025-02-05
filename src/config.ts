import dotenv from 'dotenv';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

interface ModelConfig {
  model: string;
  temperature: number;
}

interface ToolConfigs {
  dedup: ModelConfig;
  evaluator: ModelConfig;
  errorAnalyzer: ModelConfig;
  queryRewriter: ModelConfig;
  agent: ModelConfig;
  agentBeastMode: ModelConfig;
}


dotenv.config();

// Setup the proxy globally if present
if (process.env.https_proxy) {
  try {
    const proxyUrl = new URL(process.env.https_proxy).toString();
    const dispatcher = new ProxyAgent({ uri: proxyUrl });
    setGlobalDispatcher(dispatcher);
  } catch (error) {
    console.error('Failed to set proxy:', error);
  }
}

import { AIConfig, ProviderType } from './types';

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY as string;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY as string;
export const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY as string;
export const JINA_API_KEY = process.env.JINA_API_KEY as string;
export const BRAVE_API_KEY = process.env.BRAVE_API_KEY as string;
export const SEARCH_PROVIDER: 'brave' | 'jina' | 'duck' = 'jina';

export const aiConfig: AIConfig = {
  defaultProvider: 'openai' as ProviderType,
  providers: {
    gemini: {
      type: 'gemini',
      model: 'gemini-1.5-pro',
      temperature: 0
    },
    openai: {
      type: 'openai',
      model: 'gpt-3.5-turbo',
      temperature: 0
    },
    ollama: {
      type: 'ollama',
      model: 'llama2',
      temperature: 0
    }
  }
};

const defaultConfig: ModelConfig = {
  model: aiConfig.providers[aiConfig.defaultProvider].model,
  temperature: aiConfig.providers[aiConfig.defaultProvider].temperature
};

export const modelConfigs: ToolConfigs = {
  dedup: {
    ...defaultConfig,
    model: aiConfig.providers[aiConfig.defaultProvider].model,
    temperature: 0.1
  },
  evaluator: {
    ...defaultConfig,
    model: aiConfig.providers[aiConfig.defaultProvider].model
  },
  errorAnalyzer: {
    ...defaultConfig,
    model: aiConfig.providers[aiConfig.defaultProvider].model
  },
  queryRewriter: {
    ...defaultConfig,
    model: aiConfig.providers[aiConfig.defaultProvider].model,
    temperature: 0.1
  },
  agent: {
    ...defaultConfig,
    model: aiConfig.providers[aiConfig.defaultProvider].model,
    temperature: 0.7
  },
  agentBeastMode: {
    ...defaultConfig,
    model: aiConfig.providers[aiConfig.defaultProvider].model,
    temperature: 0.7
  }
};

export const STEP_SLEEP = 1000;

if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not found");
if (!JINA_API_KEY) throw new Error("JINA_API_KEY not found");

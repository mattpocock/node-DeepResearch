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

import { GenerateContentResult, GoogleGenerativeAI } from '@google/generative-ai';

interface LLMClientConfig {
  model: string;
  temperature: number;
  generationConfig?: {
    temperature: number;
    responseMimeType: string;
    responseSchema: any;
  };
}

interface LLMClient {
  getGenerativeModel(config: LLMClientConfig): {
    generateContent(prompt: string): Promise<GenerateContentResult>;
  };
}

interface GenerateContentResult {
  response: {
    text(): string;
    usageMetadata: {
      totalTokenCount: number;
    };
  };
}

class LocalLLMClient implements LLMClient {
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
            temperature: config.generationConfig?.temperature ?? config.temperature,
            response_format: {
              type: 'json_schema',
              json_schema: config.generationConfig?.responseSchema,
            },
            max_tokens: 1000,
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

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY as string;
export const JINA_API_KEY = process.env.JINA_API_KEY as string;
export const BRAVE_API_KEY = process.env.BRAVE_API_KEY as string;
export const SEARCH_PROVIDER: 'brave' | 'jina' | 'duck' = 'jina';

// LLM Configuration
export const LOCAL_LLM_HOSTNAME = process.env.LOCAL_LLM_HOSTNAME;
export const LOCAL_LLM_PORT = process.env.LOCAL_LLM_PORT;
export const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL;
export const LLM_PROVIDER = process.env.LLM_PROVIDER || 'gemini';

// Initialize LLM client based on configuration
export const llmClient: LLMClient = LLM_PROVIDER === 'local' && LOCAL_LLM_HOSTNAME && LOCAL_LLM_PORT && LOCAL_LLM_MODEL
  ? new LocalLLMClient(LOCAL_LLM_HOSTNAME, LOCAL_LLM_PORT, LOCAL_LLM_MODEL)
  : new GoogleGenerativeAI(GEMINI_API_KEY);

const DEFAULT_MODEL = 'gemini-1.5-flash';

const defaultConfig: ModelConfig = {
  model: DEFAULT_MODEL,
  temperature: 0
};

export const modelConfigs: ToolConfigs = {
  dedup: {
    ...defaultConfig,
    temperature: 0.1
  },
  evaluator: {
    ...defaultConfig
  },
  errorAnalyzer: {
    ...defaultConfig
  },
  queryRewriter: {
    ...defaultConfig,
    temperature: 0.1
  },
  agent: {
    ...defaultConfig,
    temperature: 0.7
  },
  agentBeastMode: {
    ...defaultConfig,
    temperature: 0.7
  }
};

export const STEP_SLEEP = 1000;

if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not found");
if (!JINA_API_KEY) throw new Error("JINA_API_KEY not found");

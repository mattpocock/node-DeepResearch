// Action Types
import { CoreAssistantMessage, CoreUserMessage, LanguageModelUsage } from 'ai';

type BaseAction = {
  action: 'search' | 'answer' | 'reflect' | 'visit' | 'coding';
  think: string;
};

export type SearchAction = BaseAction & {
  action: 'search';
  searchRequests: string[];
};

export type AnswerAction = BaseAction & {
  action: 'answer';
  answer: string;
  references: Array<{
    exactQuote: string;
    url: string;
  }>;
  isFinal?: boolean;
  mdAnswer?: string;
};

export type KnowledgeItem = {
  question: string;
  answer: string;
  references?:
    | Array<{
        exactQuote: string;
        url: string;
      }>
    | Array<any>;
  type: 'qa' | 'side-info' | 'chat-history' | 'url' | 'coding';
  updated: string;
  sourceCode?: string;
};

export type ReflectAction = BaseAction & {
  action: 'reflect';
  questionsToAnswer: string[];
};

export type VisitAction = BaseAction & {
  action: 'visit';
  URLTargets: string[];
};

export type CodingAction = BaseAction & {
  action: 'coding';
  codingIssue: string;
};

export type StepAction =
  | SearchAction
  | AnswerAction
  | ReflectAction
  | VisitAction
  | CodingAction;

export type EvaluationType =
  | 'definitive'
  | 'freshness'
  | 'plurality'
  | 'attribution'
  | 'completeness';

// Following Vercel AI SDK's token counting interface
export interface TokenUsage {
  tool: string;
  usage: LanguageModelUsage;
}

export interface SearchResponse {
  code: number;
  status: number;
  data: Array<{
    title: string;
    description: string;
    url: string;
    content: string;
    usage: { tokens: number };
  }> | null;
  name?: string;
  message?: string;
  readableMessage?: string;
}

export interface BraveSearchResponse {
  web: {
    results: Array<{
      title: string;
      description: string;
      url: string;
    }>;
  };
}

export interface SerperSearchResponse {
  knowledgeGraph?: {
    title: string;
    type: string;
    website: string;
    imageUrl: string;
    description: string;
    descriptionSource: string;
    descriptionLink: string;
    attributes: { [k: string]: string };
  };
  organic: {
    title: string;
    link: string;
    snippet: string;
    date: string;
    siteLinks?: { title: string; link: string }[];
    position: number;
  }[];
  topStories?: {
    title: string;
    link: string;
    source: string;
    data: string;
    imageUrl: string;
  }[];
  relatedSearches?: string[];
  credits: number;
}

export interface ReadResponse {
  code: number;
  status: number;
  data?: {
    title: string;
    description: string;
    url: string;
    content: string;
    usage: { tokens: number };
  };
  name?: string;
  message?: string;
  readableMessage?: string;
}

export type EvaluationResponse = {
  pass: boolean;
  think: string;
  type?: EvaluationType;
  freshness_analysis?: {
    days_ago: number;
    max_age_days?: number;
  };
  plurality_analysis?: {
    count_expected?: number;
    count_provided: number;
  };
  attribution_analysis?: {
    sources_provided: boolean;
    sources_verified: boolean;
    quotes_accurate: boolean;
  };
  completeness_analysis?: {
    aspects_expected: string;
    aspects_provided: string;
  };
};

export type CodeGenResponse = {
  think: string;
  code: string;
};

export type ErrorAnalysisResponse = {
  recap: string;
  blame: string;
  improvement: string;
  questionsToAnswer: string[];
};

export type SearchResult =
  | { title: string; url: string; description: string }
  | { title: string; link: string; snippet: string };

// OpenAI API Types
export interface Model {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Array<CoreUserMessage | CoreAssistantMessage>;
  stream?: boolean;
  reasoning_effort?: 'low' | 'medium' | 'high' | null;
  max_completion_tokens?: number | null;

  budget_tokens?: number | null;
  max_attempts?: number | null;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  system_fingerprint: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    logprobs: null;
    finish_reason: 'stop';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  visitedURLs?: string[];
  readURLs?: string[];
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  system_fingerprint: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
    };
    logprobs: null;
    finish_reason: null | 'stop';
  }>;
  usage?: any;
  visitedURLs?: string[];
  readURLs?: string[];
}

// Tracker Types
import { TokenTracker } from './utils/token-tracker';
import { ActionTracker } from './utils/action-tracker';

export interface TrackerContext {
  tokenTracker: TokenTracker;
  actionTracker: ActionTracker;
}

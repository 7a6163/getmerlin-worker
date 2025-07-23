import type { AllowedModel } from './constants';

export interface Env {
  AUTH_TOKEN?: string;
  GOOGLE_API_KEY?: string;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIRequest {
  model?: AllowedModel | string;
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface OpenAIResponse {
  id: string;
  object: 'chat.completion' | 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message?: {
      role: string;
      content: string;
    };
    delta?: {
      content?: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface MerlinMessage {
  childId: string;
  content: string;
  context: string;
  id: string;
  parentId: string;
}

export interface MerlinRequest {
  attachments: any[];
  chatId: string;
  language: string;
  message: MerlinMessage;
  mode: string;
  model: string;
  metadata: {
    noTask: boolean;
    isWebpageChat: boolean;
    deepResearch: boolean;
    webAccess: boolean;
    proFinderMode: boolean;
    mcpConfig: {
      isEnabled: boolean;
    };
    merlinMagic: boolean;
  };
}

export interface MerlinResponseData {
  text?: string;
  content?: string;
  type?: string;
}

export interface MerlinResponse {
  data?: MerlinResponseData;
}

export interface FirebaseTokenResponse {
  idToken?: string;
}

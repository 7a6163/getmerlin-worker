export interface Env {
  AUTH_TOKEN?: string;
  GOOGLE_API_KEY?: string;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIRequest {
  model?: string;
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

// Anthropic Messages API types

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  stream?: boolean;
  temperature?: number;
  stop_sequences?: string[];
}

export interface AnthropicContentBlock {
  type: 'text';
  text: string;
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface MerlinModelEntry {
  id: string;
  name: string;
  archived: boolean;
  paid: boolean;
  queryCost: number;
}

export interface MerlinConstantsResponse {
  textLLMs: MerlinModelEntry[];
}

import { createOpenAI } from '@ai-sdk/openai';
import { createProvider } from '@ai-sdk/provider';
import { getEncoding } from 'js-tiktoken';

import { RecursiveCharacterTextSplitter } from './text-splitter';

// Ark Provider
export interface ArkProviderOptions {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

export function createArk(options: ArkProviderOptions) {
  return createProvider({
    id: 'ark',
    baseURL: options.baseURL || 'https://ark.cn-beijing.volces.com/api/v3',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
    },
    config: {
      defaultModel: options.defaultModel || 'ark-default',
      maxInputTokens: options.maxInputTokens || 4096,
      maxOutputTokens: options.maxOutputTokens || 2048,
    },
  });
}

// Providers

const openai = createOpenAI({
  apiKey: process.env.OPENAI_KEY!,
});

const ark = createArk({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: process.env.DEEPSEEK_BASE_URL!,
  maxInputTokens: 32000,
  maxOutputTokens: 32000,
});

// Models

export const gpt4Model = openai('gpt-4o', {
  structuredOutputs: true,
});
export const gpt4MiniModel = openai('gpt-4o-mini', {
  structuredOutputs: true,
});
export const o3MiniModel = openai('o3-mini', {
  reasoningEffort: 'medium',
  structuredOutputs: true,
});

export const r1Model = ark(process.env.DEEPSEEK_MODEL_R1!);

const MinChunkSize = 140;
const encoder = getEncoding('o200k_base');

// trim prompt to maximum context size
export function trimPrompt(prompt: string, contextSize = 120_000) {
  if (!prompt) {
    return '';
  }

  const length = encoder.encode(prompt).length;
  if (length <= contextSize) {
    return prompt;
  }

  const overflowTokens = length - contextSize;
  // on average it's 3 characters per token, so multiply by 3 to get a rough estimate of the number of characters
  const chunkSize = prompt.length - overflowTokens * 3;
  if (chunkSize < MinChunkSize) {
    return prompt.slice(0, MinChunkSize);
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: 0,
  });
  const trimmedPrompt = splitter.splitText(prompt)[0] ?? '';

  // last catch, there's a chance that the trimmed prompt is same length as the original prompt, due to how tokens are split & innerworkings of the splitter, handle this case by just doing a hard cut
  if (trimmedPrompt.length === prompt.length) {
    return trimPrompt(prompt.slice(0, chunkSize), contextSize);
  }

  // recursively trim until the prompt is within the context size
  return trimPrompt(trimmedPrompt, contextSize);
}

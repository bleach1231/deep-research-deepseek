import { LanguageModelV1 } from "@ai-sdk/provider";
import { generateId, loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { ArkChatLanguageModel } from './ark-chat-language-model';
import { ArkChatSettings } from './ark-chat-settings';

export interface ArkProviderSettings {
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface ArkProvider {
  (
    modelId: string,
    settings?: ArkChatSettings,
  ): LanguageModelV1;

  chat(
    modelId: string,
    settings?: ArkChatSettings,
  ): LanguageModelV1;
}

export function createArkProvider(options: ArkProviderSettings = {}): ArkProvider {
  const createModel = (
    modelId: string,
    settings: ArkChatSettings = {},
  ) => new ArkChatLanguageModel(modelId, settings, {
    provider: 'ark.chat',
    baseURL: withoutTrailingSlash(options.baseURL) ?? 'https://ark.cn-beijing.volces.com/api/v3',
    headers: () => ({
      Authorization: `Bearer ${loadApiKey({
        apiKey: options.apiKey,
        environmentVariableName: 'DEEPSEEK_API_KEY',
        description: 'Ark Provider',
      })}`,
      ...options.headers,
    }),
    generateId: generateId,
    maxInputTokens: options.maxInputTokens,
    maxOutputTokens: options.maxOutputTokens,
  });

  const provider = function (
    modelId: string,
    settings?: ArkChatSettings,
  ) {
    if (new.target) {
      throw new Error('The model factory function cannot be called with the new keyword.');
    }
    return createModel(modelId, settings);
  };

  provider.chat = createModel;

  return provider as ArkProvider;
}

export const arkProvider = createArkProvider();

import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { createApiCall } from '@ai-sdk/provider-utils';
import { ArkChatSettings } from './ark-chat-settings';

export class ArkChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider = 'ark';
  
  constructor(
    readonly modelId: string,
    readonly settings: ArkChatSettings,
    private options: {
      provider: string;
      baseURL: string;
      headers: () => Record<string, string>;
      generateId: () => string;
      maxInputTokens?: number;
      maxOutputTokens?: number;
    },
  ) {}

  async doGenerate(options: LanguageModelV1CallOptions) {
    return createApiCall({
      provider: this.options.provider,
      baseURL: this.options.baseURL,
      headers: this.options.headers(),
      body: {
        model: this.modelId,
        messages: prompt.map(({ role, content }) => ({
          role,
          content,
        })),
        max_tokens: this.options.maxOutputTokens,
        temperature: options.temperature,
        top_p: options.topP,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        stop: options.stopSequences,
      },
      abortSignal: options.abortSignal,
      context: options.context,
      generateId: this.options.generateId,
    });
  }

  async doStream(options: LanguageModelV1CallOptions) {
    return createApiCall({
      provider: this.options.provider,
      baseURL: this.options.baseURL,
      headers: this.options.headers(),
      body: {
        model: this.modelId,
        messages: prompt.map(({ role, content }) => ({
          role,
          content,
        })),
        max_tokens: this.options.maxOutputTokens,
        temperature: options.temperature,
        top_p: options.topP,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        stop: options.stopSequences,
        stream: true,
      },
      abortSignal: options.abortSignal,
      context: options.context,
      generateId: this.options.generateId,
    });
  }
}

import { LanguageModelV1, LanguageModelV1CallOptions, LanguageModelV1StreamPart } from '@ai-sdk/provider';
import { ArkChatSettings } from './ark-chat-settings';
import { createCallSettings } from './call-settings';

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
    const { messages, ...rest } = createCallSettings(options);
    
    const response = await fetch(`${this.options.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.options.headers(),
      body: JSON.stringify({
        model: this.modelId,
        messages,
        max_tokens: this.options.maxOutputTokens,
        ...rest,
      }),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Ark API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      text: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      },
    };
  }

  async doStream(options: LanguageModelV1CallOptions): Promise<AsyncIterable<LanguageModelV1StreamPart>> {
    const { messages, ...rest } = createCallSettings(options);
    
    const response = await fetch(`${this.options.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.options.headers(),
      body: JSON.stringify({
        model: this.modelId,
        messages,
        max_tokens: this.options.maxOutputTokens,
        ...rest,
        stream: true,
      }),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Ark API error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body received');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return {
      async *[Symbol.asyncIterator]() {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') return;

              try {
                const json = JSON.parse(data);
                yield {
                  type: 'delta',
                  delta: json.choices[0].delta.content,
                };
              } catch (error) {
                console.error('Error parsing stream data:', error);
              }
            }
          }
        }
      }
    };
  }
}

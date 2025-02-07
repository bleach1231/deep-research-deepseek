import { LanguageModelV1, LanguageModelV1CallOptions, LanguageModelV1StreamPart } from '@ai-sdk/provider';
import { ArkChatSettings } from './ark-chat-settings';
import { createCallSettings } from './call-settings';

export class ArkChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider = 'ark';
  readonly defaultObjectGenerationMode = 'json';
  
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
      temperature?: number;
    },
  ) {}

  async doGenerate(options: LanguageModelV1CallOptions) {
    const { messages, ...rest } = createCallSettings(options);
    
    const requestPayload = {
      model: this.modelId,
      messages,
      max_tokens: this.options.maxOutputTokens,
      temperature: /*rest.temperature ??*/ 0.7,
      top_p: rest.top_p ?? 1,
      frequency_penalty: rest.frequency_penalty ?? 0,
      presence_penalty: rest.presence_penalty ?? 0,
      stop: rest.stop,
    };
    
    console.log('Sending request to Ark API:', {
      url: `${this.options.baseURL}/chat/completions`,
      headers: this.options.headers(),
      body: requestPayload,
    });

    const response = await fetch(`${this.options.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.options.headers(),
      body: JSON.stringify(requestPayload),
      signal: options.abortSignal,
    });

    const responseBody = await response.text();
    
    console.log('Received response from Ark API:', {
      status: response.status,
      statusText: response.statusText,
      body: responseBody,
    });

    if (!response.ok) {
      throw new Error(`Ark API error: ${response.status} ${response.statusText}\n${responseBody}`);
    }

    const data = JSON.parse(responseBody);
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
    
    const requestPayload = {
      model: this.modelId,
      messages,
      max_tokens: this.options.maxOutputTokens,
      temperature: /*rest.temperature ??*/ 0.7,
      top_p: rest.top_p ?? 1,
      frequency_penalty: rest.frequency_penalty ?? 0,
      presence_penalty: rest.presence_penalty ?? 0,
      stop: rest.stop,
      stream: true,
    };
    
    console.log('Sending request to Ark API:', {
      url: `${this.options.baseURL}/chat/completions`,
      headers: this.options.headers(),
      body: requestPayload,
    });

    const response = await fetch(`${this.options.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.options.headers(),
      body: JSON.stringify(requestPayload),
      signal: options.abortSignal,
    });

    console.log('Received response headers from Ark API:', {
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.log('Received error response body:', errorBody);
      throw new Error(`Ark API error: ${response.status} ${response.statusText}\n${errorBody}`);
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

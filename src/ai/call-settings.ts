import { LanguageModelV1CallOptions } from '@ai-sdk/provider';

export function createCallSettings(options: LanguageModelV1CallOptions) {
  return {
    messages: options.prompt.map(({ role, content }) => ({
      role,
      content,
    })),
    temperature: options.temperature,
    top_p: options.topP,
    frequency_penalty: options.frequencyPenalty,
    presence_penalty: options.presencePenalty,
    stop: options.stopSequences,
  };
}

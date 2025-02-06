import { LanguageModelV1 } from '@ai-sdk/provider';

export interface ArkChatSettings extends LanguageModelV1.Settings {
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

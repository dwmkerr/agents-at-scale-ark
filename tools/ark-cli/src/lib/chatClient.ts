import OpenAI from 'openai';
import {ArkApiClient, QueryTarget} from './arkApiClient.js';
import {ArkApiProxy} from './arkApiProxy.js';
import output from './output.js';

// Re-export QueryTarget for compatibility
export {QueryTarget};

export interface ChatConfig {
  streamingEnabled: boolean;
  currentTarget?: QueryTarget;
}

export class ChatClient {
  private arkApiClient: ArkApiClient;

  constructor(arkApiClient: ArkApiClient) {
    this.arkApiClient = arkApiClient;
  }

  async getQueryTargets(): Promise<QueryTarget[]> {
    return await this.arkApiClient.getQueryTargets();
  }

  /**
   * Send a chat completion request
   */
  async sendMessage(
    targetId: string,
    messages: Array<{role: 'user' | 'assistant' | 'system'; content: string}>,
    config: ChatConfig,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {

    const shouldStream = config.streamingEnabled && !!onChunk;

    try {
      const params = {
        model: targetId,
        messages: messages,
        signal: signal,
      };

      if (shouldStream) {
        let fullResponse = '';
        const stream = this.arkApiClient.createChatCompletionStream(params);
        
        for await (const chunk of stream) {
          if (signal?.aborted) {
            break;
          }

          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            if (onChunk) {
              onChunk(content);
            }
          }
        }
        return fullResponse;
      } else {
        const response = await this.arkApiClient.createChatCompletion(params);
        const content = response.choices[0]?.message?.content || '';
        
        if (shouldStream && onChunk && content) {
          onChunk(content);
        }
        
        return content;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      output.error('failed to call openai api:', errorMessage);
      throw error;
    }
  }
}

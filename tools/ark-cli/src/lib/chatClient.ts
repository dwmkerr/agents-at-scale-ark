import {ArkApiClient, QueryTarget} from './arkApiClient.js';
import output from './output.js';

// Re-export QueryTarget for compatibility
export {QueryTarget};

export interface ChatConfig {
  streamingEnabled: boolean;
  currentTarget?: QueryTarget;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
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
    onChunk?: (chunk: string, toolCalls?: ToolCall[]) => void,
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
        const toolCallsById = new Map<number, ToolCall>();

        const stream = this.arkApiClient.createChatCompletionStream(params);

        for await (const chunk of stream) {
          if (signal?.aborted) {
            break;
          }

          const delta = chunk.choices[0]?.delta;

          // Handle regular content
          const content = delta?.content || '';
          if (content) {
            fullResponse += content;
            if (onChunk) {
              onChunk(content);
            }
          }

          // Handle tool calls
          if (delta?.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              const index = toolCallDelta.index;

              // Initialize tool call if this is the first chunk for this index
              if (!toolCallsById.has(index)) {
                toolCallsById.set(index, {
                  id: toolCallDelta.id || '',
                  type: toolCallDelta.type || 'function',
                  function: {
                    name: toolCallDelta.function?.name || '',
                    arguments: ''
                  }
                });
              }

              // Accumulate function arguments
              const toolCall = toolCallsById.get(index)!;
              if (toolCallDelta.function?.arguments) {
                toolCall.function.arguments += toolCallDelta.function.arguments;
              }

              // Send the current state of all tool calls
              if (onChunk) {
                const toolCallsArray = Array.from(toolCallsById.values());
                onChunk('', toolCallsArray);
              }
            }
          }
        }
        return fullResponse;
      } else {
        const response = await this.arkApiClient.createChatCompletion(params);
        const message = response.choices[0]?.message;
        const content = message?.content || '';


        // Handle tool calls in non-streaming mode
        if (message?.tool_calls && message.tool_calls.length > 0) {
          const toolCalls: ToolCall[] = message.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: tc.type || 'function',
            function: {
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || ''
            }
          }));

          // Send tool calls first
          if (onChunk) {
            onChunk('', toolCalls);
          }
        }

        // Send content after tool calls
        if (content && onChunk) {
          onChunk(content);
        }

        return content;
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      output.error('failed to call openai api:', errorMessage);
      throw error;
    }
  }
}

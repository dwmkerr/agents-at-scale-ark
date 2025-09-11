import OpenAI from 'openai';

export interface QueryTarget {
  id: string;
  name: string;
  type: 'agent' | 'model' | 'tool' | string;
  description?: string;
}

export class ArkApiClient {
  private openai: OpenAI;
  private baseUrl: string;

  constructor(arkApiUrl: string) {
    this.baseUrl = arkApiUrl;
    this.openai = new OpenAI({
      baseURL: `${arkApiUrl}/openai/v1`,
      apiKey: 'dummy', // ark-api doesn't require an API key
      dangerouslyAllowBrowser: false,
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async getQueryTargets(): Promise<QueryTarget[]> {
    try {
      const models = await this.openai.models.list();

      const targets: QueryTarget[] = models.data.map((model) => {
        const parts = model.id.split('/');
        const type = parts[0] || 'model';
        const name = parts.slice(1).join('/') || model.id;

        return {
          id: model.id,
          name,
          type,
          description: model.id,
        };
      });

      return targets;
    } catch (error) {
      throw new Error(`Failed to get query targets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createChatCompletion(params: OpenAI.Chat.Completions.ChatCompletionCreateParams): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    return await this.openai.chat.completions.create({
      ...params,
      stream: false,
    }) as OpenAI.Chat.Completions.ChatCompletion;
  }

  createChatCompletionStream(params: OpenAI.Chat.Completions.ChatCompletionCreateParams): AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> {
    return this.openai.chat.completions.create({
      ...params,
      stream: true,
    }) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  }
}
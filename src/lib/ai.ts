// Workers AI 封装：聊天 / 嵌入 / 文本生成

import type { Env } from '../env';
import { DB } from './db';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AI {
  constructor(private env: Env, private db: DB) {}

  async model(): Promise<string> {
    return this.db.getSetting('ai_model', '@cf/meta/llama-3.1-8b-instruct');
  }

  async embeddingModel(): Promise<string> {
    return this.db.getSetting('ai_embedding_model', '@cf/baai/bge-small-en-v1.5');
  }

  /** 流式聊天，返回 ReadableStream（逐 token 文本流，适合 SSE） */
  async chatStream(messages: ChatMessage[], modelOverride?: string): Promise<ReadableStream<Uint8Array>> {
    const model = modelOverride || (await this.model());
    const enc = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          const res = (await this.env.AI.run(model as never, { messages, stream: true })) as unknown as
            | AsyncIterable<{ response?: string }>
            | ReadableStream<Uint8Array>;
          // 优先当作 async iterable 处理
          if (res && typeof (res as AsyncIterable<{ response?: string }>)[Symbol.asyncIterator] === 'function') {
            for await (const part of res as AsyncIterable<{ response?: string }>) {
              const text = part?.response || '';
              if (text) controller.enqueue(enc.encode(text));
            }
          } else {
            // 兜底：当作 ReadableStream 透传
            const reader = (res as ReadableStream<Uint8Array>).getReader();
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) controller.enqueue(value);
            }
          }
        } catch (e) {
          controller.error(e);
          return;
        }
        if (!closed) controller.close();
      },
      cancel() {
        closed = true;
      },
    });
    return stream;
  }

  /** 非流式聊天 */
  async chat(messages: ChatMessage[], modelOverride?: string): Promise<string> {
    const model = modelOverride || (await this.model());
    const res = (await this.env.AI.run(model as never, { messages })) as { response?: string };
    return res.response || '';
  }

  /** 嵌入向量 */
  async embed(text: string): Promise<number[]> {
    const model = await this.embeddingModel();
    const res = (await this.env.AI.run(model as never, { text: [text] })) as { data?: number[][] };
    return res.data?.[0] ?? [];
  }

  /** 文本生成（prompt） */
  async generate(prompt: string, modelOverride?: string): Promise<string> {
    const model = modelOverride || (await this.model());
    const res = (await this.env.AI.run(model as never, { prompt })) as { response?: string };
    return res.response || '';
  }
}

export function getAI(env: Env, db: DB): AI {
  return new AI(env, db);
}

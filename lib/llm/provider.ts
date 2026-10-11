import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export type LLMProvider = 'openrouter' | 'openai' | 'anthropic' | 'gemini' | 'xai';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed?: number;
}

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

export class LLMClient {
  private config: LLMConfig;
  
  constructor(config: LLMConfig) {
    this.config = config;
  }
  
  async chat(messages: LLMMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse> {
    const { provider, apiKey } = this.config;
    
    try {
      switch (provider) {
        case 'openrouter':
          return await this.chatOpenRouter(messages, options);
        case 'openai':
          return await this.chatOpenAI(messages, options);
        case 'anthropic':
          return await this.chatAnthropic(messages, options);
        case 'gemini':
          return await this.chatGemini(messages, options);
        case 'xai':
          return await this.chatXAI(messages, options);
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      console.error(`LLM error (${provider}):`, error);
      throw error;
    }
  }
  
  private async chatOpenRouter(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<LLMResponse> {
    const client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    
    const response = await client.chat.completions.create({
      model: this.config.model || 'anthropic/claude-3.5-sonnet',
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4000,
    });
    
    return {
      content: response.choices[0]?.message?.content || '',
      tokensUsed: response.usage?.total_tokens,
    };
  }
  
  private async chatOpenAI(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<LLMResponse> {
    const client = new OpenAI({
      apiKey: this.config.apiKey,
    });
    
    const response = await client.chat.completions.create({
      model: this.config.model || 'gpt-4o',
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4000,
    });
    
    return {
      content: response.choices[0]?.message?.content || '',
      tokensUsed: response.usage?.total_tokens,
    };
  }
  
  private async chatAnthropic(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<LLMResponse> {
    const client = new Anthropic({
      apiKey: this.config.apiKey,
    });
    
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    
    const response = await client.messages.create({
      model: this.config.model || 'claude-3-5-sonnet-20241022',
      system: systemMessage,
      messages: nonSystemMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4000,
    });
    
    return {
      content: response.content[0]?.type === 'text' ? response.content[0].text : '',
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  }
  
  private async chatGemini(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<LLMResponse> {
    const genAI = new GoogleGenerativeAI(this.config.apiKey);
    const model = genAI.getGenerativeModel({ 
      model: this.config.model || 'gemini-1.5-pro',
    });
    
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationHistory = messages.filter(m => m.role !== 'system');
    
    const history = conversationHistory.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    
    const chat = model.startChat({
      history,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 4000,
      },
    });
    
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    const prompt = systemMessage 
      ? `${systemMessage}\n\n${lastMessage.content}`
      : lastMessage.content;
    
    const result = await chat.sendMessage(prompt);
    const response = result.response;
    
    return {
      content: response.text(),
    };
  }
  
  private async chatXAI(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<LLMResponse> {
    const client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
    
    const response = await client.chat.completions.create({
      model: this.config.model || 'grok-beta',
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4000,
    });
    
    return {
      content: response.choices[0]?.message?.content || '',
      tokensUsed: response.usage?.total_tokens,
    };
  }
}

export async function createLLMClient(config: LLMConfig): Promise<LLMClient> {
  return new LLMClient(config);
}

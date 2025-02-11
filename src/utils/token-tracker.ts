import { EventEmitter } from 'events';

import { TokenUsage, TokenCategory } from '../types';

export class TokenTracker extends EventEmitter {
  private usages: TokenUsage[] = [];
  private budget?: number;

  constructor(budget?: number) {
    super();
    this.budget = budget;

    if ('asyncLocalContext' in process) {
      const asyncLocalContext = process.asyncLocalContext as any;
      this.on('usage', () => {
        if (asyncLocalContext.available()) {
          asyncLocalContext.ctx.chargeAmount = this.getTotalUsage();
        }
      });
      
    }
  }

  trackUsage(tool: string, tokens: number, category?: TokenCategory) {
    const currentTotal = this.getTotalUsage();
    if (this.budget && currentTotal + tokens > this.budget) {
      console.error(`Token budget exceeded: ${currentTotal + tokens} > ${this.budget}`);
    }
    // Only track usage if we're within budget
    if (!this.budget || currentTotal + tokens <= this.budget) {
      const usage = { tool, tokens, category };
      this.usages.push(usage);
      console.log(`[TokenTracker] Adding ${tokens} tokens from ${tool}${category ? ` (${category})` : ''}`);
      console.log(`[TokenTracker] New total: ${this.getTotalUsage()}`);
      this.emit('usage', usage);
    }
  }

  getTotalUsage(): number {
    return this.usages.reduce((sum, usage) => sum + usage.tokens, 0);
  }

  getUsageBreakdown(): Record<string, number> {
    return this.usages.reduce((acc, { tool, tokens }) => {
      acc[tool] = (acc[tool] || 0) + tokens;
      return acc;
    }, {} as Record<string, number>);
  }

  getUsageDetails(): {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    completion_tokens_details?: {
      reasoning_tokens: number;
      accepted_prediction_tokens: number;
      rejected_prediction_tokens: number;
    };
  } {
    const toolBreakdown = this.getUsageBreakdown();
    const prompt_tokens = toolBreakdown.agent || 0;
    const completion_tokens = Object.entries(toolBreakdown)
      .filter(([tool]) => tool !== 'agent')
      .reduce((sum, [, tokens]) => sum + tokens, 0);

    return {
      prompt_tokens,
      completion_tokens,
      total_tokens: prompt_tokens + completion_tokens
    };
  }

  printSummary() {
    const breakdown = this.getUsageBreakdown();
    console.log('Token Usage Summary:', {
      total: this.getTotalUsage(),
      breakdown
    });
  }

  reset() {
    this.usages = [];
  }
}

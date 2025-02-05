import { EventEmitter } from 'events';

import { TokenUsage, ProviderType } from '../types';

export class TokenTracker extends EventEmitter {
  private usages: TokenUsage[] = [];
  private budget?: number;

  constructor(budget?: number) {
    super();
    this.budget = budget;
  }

  trackUsage(tool: string, tokens: number, provider?: ProviderType) {
    const currentTotal = this.getTotalUsage();
    if (this.budget && currentTotal + tokens > this.budget) {
      console.error(`Token budget exceeded: ${currentTotal + tokens} > ${this.budget}`);
    }
    // Only track usage if we're within budget
    if (!this.budget || currentTotal + tokens <= this.budget) {
      this.usages.push({ tool, tokens, provider });
      this.emit('usage', { tool, tokens, provider });
    }
  }

  getTotalUsage(): number {
    return this.usages.reduce((sum, usage) => sum + usage.tokens, 0);
  }

  getUsageBreakdown(): Record<string, { total: number; byProvider: Record<string, number> }> {
    return this.usages.reduce((acc, { tool, tokens, provider }) => {
      if (!acc[tool]) {
        acc[tool] = { total: 0, byProvider: {} };
      }
      acc[tool].total += tokens;
      if (provider) {
        acc[tool].byProvider[provider] = (acc[tool].byProvider[provider] || 0) + tokens;
      }
      return acc;
    }, {} as Record<string, { total: number; byProvider: Record<string, number> }>);
  }

  printSummary() {
    const breakdown = this.getUsageBreakdown();
    const totalByProvider = this.usages.reduce((acc, { tokens, provider }) => {
      if (provider) {
        acc[provider] = (acc[provider] || 0) + tokens;
      }
      return acc;
    }, {} as Record<string, number>);

    console.log('Token Usage Summary:', {
      total: this.getTotalUsage(),
      byProvider: totalByProvider,
      breakdown
    });
  }

  reset() {
    this.usages = [];
  }
}

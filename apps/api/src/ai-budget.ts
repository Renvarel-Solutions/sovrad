import {randomUUID} from 'node:crypto';
import type Database from 'better-sqlite3';

// Integer USD millionths; pin policy with the model, never silently switch prices.
export const AI_MODEL = 'gpt-5.6-terra';
export const AI_LIMIT_MICROS = 5_000_000;
export const AI_OUTPUT_CAP = 1500;
export const AI_INPUT_CAP = 8192;
const cost = (input: number, output: number): number => Math.ceil(input * 2.5 + output * 12);
export type BudgetStatus = {
  limitMicros: number; spentMicros: number; reservedMicros: number;
  remainingMicros: number; paused: boolean; dailyAttempts: number; model: string;
};
type Spending = {reserved_micros: number; input_tokens: number; state: string};

export class AIBudget {
  constructor(private readonly db: Database.Database) {}

  status(): BudgetStatus {
    const row = this.db.prepare(`SELECT COALESCE(SUM(actual_micros),0) AS spent,
      COALESCE(SUM(CASE WHEN state!='settled' THEN reserved_micros ELSE 0 END),0) AS reserved,
      SUM(CASE WHEN state!='settled' THEN 1 ELSE 0 END) AS pending FROM ai_spending`).get() as
      {spent: number; reserved: number; pending: number};
    const day = new Date().toISOString().slice(0, 10);
    const daily = this.db.prepare('SELECT requests FROM ai_daily_usage WHERE day=?').get(day) as {requests: number} | undefined;
    return {limitMicros: AI_LIMIT_MICROS, spentMicros: row.spent, reservedMicros: row.reserved,
      remainingMicros: Math.max(0, AI_LIMIT_MICROS - row.spent - row.reserved),
      paused: row.pending > 0, dailyAttempts: daily?.requests ?? 0, model: AI_MODEL};
  }

  reserve(inputTokens: number): string {
    if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > AI_INPUT_CAP) throw new Error('Invalid token count');
    return this.db.transaction(() => {
      const status = this.status();
      if (status.paused) throw new Error('AI spending paused: pending or unknown charge');
      const amount = cost(inputTokens, AI_OUTPUT_CAP);
      if (amount > status.remainingMicros) throw new Error('AI trial budget exhausted');
      const id = randomUUID();
      this.db.prepare(`INSERT INTO ai_spending(id,state,reserved_micros,input_tokens,actual_micros,created_at)
        VALUES (?,'pending',?,?,0,?)`).run(id, amount, inputTokens, new Date().toISOString());
      return id;
    }).immediate();
  }

  settle(id: string, usage: {input_tokens: number; output_tokens: number}): void {
    this.db.transaction(() => {
      const row = this.db.prepare('SELECT * FROM ai_spending WHERE id=?').get(id) as Spending | undefined;
      if (!row || row.state !== 'pending') throw new Error('Charge already resolved or unknown');
      if (!Number.isSafeInteger(usage.input_tokens) || usage.input_tokens < 0 || usage.input_tokens > row.input_tokens ||
          !Number.isSafeInteger(usage.output_tokens) || usage.output_tokens < 0 || usage.output_tokens > AI_OUTPUT_CAP) {
        throw new Error('Invalid usage; retain reservation');
      }
      const actual = cost(usage.input_tokens, usage.output_tokens);
      if (actual > row.reserved_micros) throw new Error('Usage exceeded reservation');
      this.db.prepare("UPDATE ai_spending SET state='settled',actual_micros=? WHERE id=? AND state='pending'").run(actual, id);
    }).immediate();
  }

  unknown(id: string): void {
    this.db.prepare("UPDATE ai_spending SET state='unknown' WHERE id=? AND state='pending'").run(id);
  }
}

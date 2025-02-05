import OpenAI from 'openai';
import { OPENAI_API_KEY, modelConfigs } from "../config";
import { TokenTracker } from "../utils/token-tracker";
import { EvaluationResponse } from '../types';
import { z } from 'zod';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const responseSchema = z.object({
  is_definitive: z.boolean().describe("Whether the answer provides a definitive response without uncertainty or 'I don't know' type statements"),
  reasoning: z.string().describe("Explanation of why the answer is or isn't definitive")
});

function getPrompt(question: string, answer: string): string {
  return `You are an evaluator of answer definitiveness. Analyze if the given answer provides a definitive response or not.

Core Evaluation Criterion:
- Definitiveness: "I don't know", "lack of information", "doesn't exist", "not sure" or highly uncertain/ambiguous responses are **not** definitive, must return false!

Examples:

Question: "What are the system requirements for running Python 3.9?"
Answer: "I'm not entirely sure, but I think you need a computer with some RAM."
Evaluation: {
  "is_definitive": false,
  "reasoning": "The answer contains uncertainty markers like 'not entirely sure' and 'I think', making it non-definitive."
}

Question: "What are the system requirements for running Python 3.9?"
Answer: "Python 3.9 requires Windows 7 or later, macOS 10.11 or later, or Linux."
Evaluation: {
  "is_definitive": true,
  "reasoning": "The answer makes clear, definitive statements without uncertainty markers or ambiguity."
}

Question: "what is the twitter account of jina ai's founder?"
Answer: "The provided text does not contain the Twitter account of Jina AI's founder."
Evaluation: {
  "is_definitive": false,
  "reasoning": "The answer indicates a lack of information rather than providing a definitive response."
}

Now evaluate this pair:
Question: ${JSON.stringify(question)}
Answer: ${JSON.stringify(answer)}`;
}

export async function evaluateAnswer(question: string, answer: string, tracker?: TokenTracker): Promise<{ response: EvaluationResponse, tokens: number }> {
  try {
    const prompt = getPrompt(question, answer);
    const result = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: modelConfigs.evaluator.model,
      temperature: modelConfigs.evaluator.temperature,
      max_tokens: 1000,
      functions: [{
        name: 'generate',
        parameters: responseSchema.shape
      }],
      function_call: { name: 'generate' }
    });

    const functionCall = result.choices[0].message.function_call;
    const responseData = functionCall ? JSON.parse(functionCall.arguments) as EvaluationResponse : null;
    if (!responseData) throw new Error('No valid response generated');

    console.log('Evaluation:', {
      definitive: responseData.is_definitive,
      reason: responseData.reasoning
    });

    const tokens = result.usage.total_tokens;
    (tracker || new TokenTracker()).trackUsage('evaluator', tokens);
    return { response: responseData, tokens };
  } catch (error) {
    console.error('Error in answer evaluation:', error);
    throw error;
  }
}

// Example usage
async function main() {
  const question = process.argv[2] || '';
  const answer = process.argv[3] || '';

  if (!question || !answer) {
    console.error('Please provide both question and answer as command line arguments');
    process.exit(1);
  }

  try {
    await evaluateAnswer(question, answer);
  } catch (error) {
    console.error('Failed to evaluate answer:', error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

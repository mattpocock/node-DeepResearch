import { z } from 'zod';
import { generateObject } from 'ai';
import { getModel, getMaxTokens } from "../config";
import { TokenTracker } from "../utils/token-tracker";
import { EvaluationResponse } from '../types';
import { handleGenerateObjectError } from '../utils/error-handling';

const model = getModel('evaluator');

type EvaluationType = 'definitive' | 'freshness' | 'plurality';

const baseSchema = {
  pass: z.boolean().describe('Whether the answer passes the evaluation criteria defined by the evaluator'),
  think: z.string().describe('Explanation the thought process why the answer does not pass the evaluation criteria')
};

const definitiveSchema = z.object({
  ...baseSchema,
  type: z.literal('definitive')
});

const freshnessSchema = z.object({
  ...baseSchema,
  type: z.literal('freshness'),
  freshness_analysis: z.object({
    likely_outdated: z.boolean().describe('Whether the answer content is likely outdated based on dates and current time'),
    dates_mentioned: z.array(z.string()).describe('All dates mentioned in the answer'),
    current_time: z.string().describe('Current system time when evaluation was performed'),
    max_age_days: z.number().optional().describe('Maximum allowed age in days before content is considered outdated')
  })
});

const pluralitySchema = z.object({
  ...baseSchema,
  type: z.literal('plurality'),
  plurality_analysis: z.object({
    expects_multiple: z.boolean().describe('Whether the question asks for multiple items'),
    provides_multiple: z.boolean().describe('Whether the answer provides multiple items'),
    count_expected: z.number().optional().describe('Number of items expected if specified in question'),
    count_provided: z.number().describe('Number of items provided in answer')
  })
});

function getDefinitivePrompt(question: string, answer: string): string {
  return `You are an evaluator of answer definitiveness. Analyze if the given answer provides a definitive response or not.

<rules>
First, if the answer is not a direct response to the question, it must return false. 
Definitiveness is the king! The following types of responses are NOT definitive and must return false:
  1. Expressions of uncertainty: "I don't know", "not sure", "might be", "probably"
  2. Lack of information statements: "doesn't exist", "lack of information", "could not find"
  3. Inability statements: "I cannot provide", "I am unable to", "we cannot"
  4. Negative statements that redirect: "However, you can...", "Instead, try..."
  5. Non-answers that suggest alternatives
</rules>

<examples>
Question: "What are the system requirements for running Python 3.9?"
Answer: "I'm not entirely sure, but I think you need a computer with some RAM."
Evaluation: {
  "pass": false,
  "think": "The answer contains uncertainty markers like 'not entirely sure' and 'I think', making it non-definitive."
}

Question: "What are the system requirements for running Python 3.9?"
Answer: "Python 3.9 requires Windows 7 or later, macOS 10.11 or later, or Linux."
Evaluation: {
  "pass": true,
  "think": "The answer makes clear, definitive statements without uncertainty markers or ambiguity."
}

Question: "Who will be the president of the United States in 2032?"
Answer: "I cannot predict the future, it depends on the election results."
Evaluation: {
  "pass": false,
  "think": "The answer contains a statement of inability to predict the future, making it non-definitive."
}

Question: "Who is the sales director at Company X?"
Answer: "I cannot provide the name of the sales director, but you can contact their sales team at sales@companyx.com"
Evaluation: {
  "pass": false,
  "think": "The answer starts with 'I cannot provide' and redirects to an alternative contact method instead of answering the original question."
}

Question: "what is the twitter account of jina ai's founder?"
Answer: "The provided text does not contain the Twitter account of Jina AI's founder."
Evaluation: {
  "pass": false,
  "think": "The answer indicates a lack of information rather than providing a definitive response."
}
</examples>

Now evaluate this pair:
Question: ${JSON.stringify(question)}
Answer: ${JSON.stringify(answer)}`;
}

function getFreshnessPrompt(question: string, answer: string, currentTime: string): string {
  return `You are an evaluator that analyzes if answer content is likely outdated based on mentioned dates and current time.

<rules>
1. Date Analysis:
   - Extract all dates mentioned in the answer
   - Compare against current system time: ${currentTime}
   - Consider content outdated if:
     * It refers to a "latest" or "current" state from more than 30 days ago
     * It mentions specific dates/events that have been superseded
     * It contains time-sensitive information (e.g., "current CEO", "latest version") from more than 60 days ago
   - For product versions, releases, or announcements, max age is 30 days
   - For company positions, leadership, or general facts, max age is 60 days

2. Context Hints:
   - Words indicating recency: "latest", "current", "newest", "just released", "recently"
   - Time-sensitive terms: "CEO", "price", "version", "release"
   - Future dates should be ignored in outdated calculation
</rules>

<examples>
Question: "What is Jina AI's latest embedding model?"
Answer: "The latest embedding model from Jina AI is jina-embeddings-v2, released on March 15, 2024."
Current Time: "2024-10-06T00:00:00Z"
Evaluation: {
  "pass": false,
  "think": "The answer refers to a 'latest' model release from over 6 months ago, which is likely outdated for product version information",
  "freshness_analysis": {
    "likely_outdated": true,
    "dates_mentioned": ["2024-03-15"],
    "current_time": "2024-10-06T00:00:00Z",
    "max_age_days": 30
  }
}

Question: "Who is OpenAI's CEO?"
Answer: "Sam Altman is the CEO of OpenAI as of December 2023."
Current Time: "2024-02-06T00:00:00Z"
Evaluation: {
  "pass": true,
  "think": "The answer is about company leadership and is within the 60-day threshold for such information",
  "freshness_analysis": {
    "likely_outdated": false,
    "dates_mentioned": ["2023-12"],
    "current_time": "2024-02-06T00:00:00Z",
    "max_age_days": 60
  }
}
</examples>

Now evaluate this pair:
Question: ${JSON.stringify(question)}
Answer: ${JSON.stringify(answer)}`;
}

function getPluralityPrompt(question: string, answer: string): string {
  return `You are an evaluator that analyzes if answers provide the appropriate number of items requested in the question.

<rules>
1. Question Analysis:
   - Check if question asks for multiple items using indicators like:
     * Plural nouns: "companies", "people", "names"
     * Quantifiers: "all", "many", "several", "various", "multiple"
     * List requests: "list", "enumerate", "name all", "give me all"
     * Numbers: "5 examples", "top 10"
   - Otherwise skip the analysis and return pass to true

2. Answer Analysis:
   - Count distinct items provided in the answer
   - Check if answer uses limiting words like "only", "just", "single"
   - Identify if answer acknowledges there are more items but only provides some

3. Definitiveness Rules:
   - If question asks for multiple items but answer provides only one → NOT definitive
   - If question asks for specific number (e.g., "top 5") but answer provides fewer → NOT definitive
   - If answer clearly states it's providing a partial list → NOT definitive
   - If question asks for "all" or "every" but answer seems incomplete → NOT definitive
</rules>

<examples>
Question: "Who works in Jina AI's sales team?"
Answer: "John Smith is a sales representative at Jina AI."
Evaluation: {
  "pass": true,
  "think": "The question doesn't specifically ask for multiple team members, so a single name can be considered a definitive answer.",
  "plurality_analysis": {
    "expects_multiple": false,
    "provides_multiple": false,
    "count_provided": 1
  }
}

Question: "List all the salespeople who work at Jina AI"
Answer: "John Smith is a sales representative at Jina AI."
Evaluation: {
  "pass": false,
  "think": "The question asks for 'all salespeople' but the answer only provides one name without indicating if this is the complete list.",
  "plurality_analysis": {
    "expects_multiple": true,
    "provides_multiple": false,
    "count_provided": 1
  }
}

Question: "Name the top 3 products sold by Jina AI"
Answer: "Jina AI's product lineup includes DocArray and Jina."
Evaluation: {
  "pass": false,
  "think": "The question asks for top 3 products but only 2 are provided.",
  "plurality_analysis": {
    "expects_multiple": true,
    "provides_multiple": true,
    "count_expected": 3,
    "count_provided": 2
  }
}

Question: "List as many AI companies in Berlin as you can find"
Answer: "Here are several AI companies in Berlin: Ada Health, Merantix, DeepL, Understand.ai, and Zeitgold. There are many more AI companies in Berlin, but these are some notable examples."
Evaluation: {
  "pass": false,
  "think": "While the answer provides multiple companies, it explicitly states it's an incomplete list when the question asks to list as many as possible.",
  "plurality_analysis": {
    "expects_multiple": true,
    "provides_multiple": true,
    "count_provided": 5
  }
}
</examples>

Now evaluate this pair:
Question: ${JSON.stringify(question)}
Answer: ${JSON.stringify(answer)}`;
}

export async function evaluateAnswer(
  question: string,
  answer: string,
  evaluationOrder: EvaluationType[] = ['definitive', 'freshness', 'plurality'],
  tracker?: TokenTracker
): Promise<{ response: EvaluationResponse }> {
  let result;

  for (const evaluationType of evaluationOrder) {
    try {
      switch (evaluationType) {
        case 'definitive':
          result = await generateObject({
            model,
            schema: definitiveSchema,
            prompt: getDefinitivePrompt(question, answer),
            maxTokens: getMaxTokens('evaluator')
          });
          (tracker || new TokenTracker()).trackUsage('evaluator', result.usage?.totalTokens || 0);
          console.log('Evaluation:', result.object);
          if (!result.object.pass) {
            return { response: result.object };
          }
          break;

        case 'freshness':
          result = await generateObject({
            model,
            schema: freshnessSchema,
            prompt: getFreshnessPrompt(question, answer, new Date().toISOString()),
            maxTokens: getMaxTokens('evaluator')
          });
          (tracker || new TokenTracker()).trackUsage('evaluator', result.usage?.totalTokens || 0);
          console.log('Evaluation:', result.object);
          if (!result.object.pass) {
            return { response: result.object };
          }
          break;

        case 'plurality':
          result = await generateObject({
            model,
            schema: pluralitySchema,
            prompt: getPluralityPrompt(question, answer),
            maxTokens: getMaxTokens('evaluator')
          });
          (tracker || new TokenTracker()).trackUsage('evaluator', result.usage?.totalTokens || 0);
          console.log('Evaluation:', result.object);
          if (!result.object.pass) {
            return { response: result.object };
          }
          break;
      }
    } catch (error) {
      const errorResult = await handleGenerateObjectError<EvaluationResponse>(error);
      (tracker || new TokenTracker()).trackUsage('evaluator', errorResult.totalTokens || 0);
      // Always return from catch block to prevent undefined result
      return { response: errorResult.object };
    }
  }

  // Only reach this point if all evaluations pass
  return { response: result!.object };
}
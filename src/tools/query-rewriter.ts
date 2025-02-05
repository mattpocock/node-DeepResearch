import OpenAI from 'openai';
import { OPENAI_API_KEY, modelConfigs } from "../config";
import { TokenTracker } from "../utils/token-tracker";
import { SearchAction, KeywordsResponse } from "../types";
import { z } from 'zod';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const responseSchema = z.object({
  think: z.string().describe("Strategic reasoning about query complexity and search approach"),
  queries: z.array(
    z.string().describe("Search query, must be less than 30 characters")
  ).describe("Array of search queries, orthogonal to each other")
    .min(1)
    .max(3)
});

function getPrompt(action: SearchAction): string {
  return `You are an expert Information Retrieval Assistant. Transform user queries into precise keyword combinations with strategic reasoning and appropriate search operators.

<rules>
1. Generate search queries that directly include appropriate operators
2. Keep base keywords minimal: 2-3 words preferred
3. Use exact match quotes for specific phrases that must stay together
4. Split queries only when necessary for distinctly different aspects
5. Preserve crucial qualifiers while removing fluff words
6. Make the query resistant to SEO manipulation
7. When necessary, append <query-operators> at the end only when must needed


<query-operators>
A query can't only have operators; and operators can't be at the start a query;

- "phrase" : exact match for phrases
- +term : must include term; for critical terms that must appear
- -term : exclude term; exclude irrelevant or ambiguous terms
- filetype:pdf/doc : specific file type
- site:example.com : limit to specific site
- lang:xx : language filter (ISO 639-1 code)
- loc:xx : location filter (ISO 3166-1 code)
- intitle:term : term must be in title
- inbody:term : term must be in body text
</query-operators>

</rules>

<examples>
Input Query: What's the difference between ReactJS and Vue.js for building web applications?
<think>
This is a comparison query. User is likely looking for technical evaluation and objective feature comparisons, possibly for framework selection decisions. We'll split this into separate queries to capture both high-level differences and specific technical aspects.
</think>
Queries: [
  "react performance",
  "vue performance",
  "react vue comparison",
]

Input Query: How to fix a leaking kitchen faucet?
<think>
This is a how-to query seeking practical solutions. User likely wants step-by-step guidance and visual demonstrations for DIY repair. We'll target both video tutorials and written guides.
</think>
Queries: [
  "kitchen faucet leak repair",
  "faucet drip fix site:youtube.com",
  "how to repair faucet "
]

Input Query: What are healthy breakfast options for type 2 diabetes?
<think>
This is a health-specific informational query. User needs authoritative medical advice combined with practical meal suggestions. Splitting into medical guidelines and recipes will provide comprehensive coverage.
</think>
Queries: [
  "what to eat for type 2 diabetes",
  "type 2 diabetes breakfast guidelines",
  "diabetic breakfast recipes"
]

Input Query: Latest AWS Lambda features for serverless applications
<think>
This is a product research query focused on recent updates. User wants current information about specific technology features, likely for implementation purposes. We'll target official docs and community insights.
</think>
Queries: [
  "aws lambda features site:aws.amazon.com intitle:2025",
  "new features lambda serverless"
]
</examples>

Now, process this query:
Input Query: ${action.searchQuery}
Intention: ${action.think}
`;
}

export async function rewriteQuery(action: SearchAction, tracker?: TokenTracker): Promise<{ queries: string[], tokens: number }> {
  try {
    const prompt = getPrompt(action);
    const result = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: modelConfigs.queryRewriter.model,
      temperature: modelConfigs.queryRewriter.temperature,
      max_tokens: 1000,
      functions: [{
        name: 'generate',
        parameters: responseSchema.shape
      }],
      function_call: { name: 'generate' }
    });

    const functionCall = result.choices[0].message.function_call;
    const responseData = functionCall ? JSON.parse(functionCall.arguments) as KeywordsResponse : null;
    if (!responseData) throw new Error('No valid response generated');

    console.log('Query rewriter:', responseData.queries);
    const tokens = result.usage.total_tokens;
    (tracker || new TokenTracker()).trackUsage('query-rewriter', tokens);

    return { queries: responseData.queries, tokens };
  } catch (error) {
    console.error('Error in query rewriting:', error);
    throw error;
  }
}

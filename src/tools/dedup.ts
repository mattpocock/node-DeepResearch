import { ProviderFactory, AIProvider, isGeminiProvider, isOpenAIProvider } from '../utils/provider-factory';
import { aiConfig, modelConfigs } from "../config";
import { TokenTracker } from "../utils/token-tracker";
import { DedupResponse, ProviderType, OpenAIFunctionParameter } from '../types';
import { z } from 'zod';
import { getProviderSchema } from '../utils/schema';

const responseSchema = z.object({
  think: z.string().describe("Strategic reasoning about the overall deduplication approach"),
  unique_queries: z.array(
    z.string().describe("Unique query that passed the deduplication process, must be less than 30 characters")
  ).describe("Array of semantically unique queries")
});

async function generateResponse(provider: AIProvider, prompt: string, providerType: ProviderType) {
  if (!isGeminiProvider(provider) && !isOpenAIProvider(provider)) {
    throw new Error('Invalid provider type');
  }
  switch (providerType) {
    case 'gemini': {
      if (!isGeminiProvider(provider)) throw new Error('Invalid provider type');
      const result = await provider.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }]}],
        generationConfig: {
          temperature: modelConfigs.dedup.temperature,
          maxOutputTokens: 1000
        }
      });
      const response = await result.response;
      return {
        text: response.text(),
        tokens: response.usageMetadata?.totalTokenCount || 0
      };
    }
    case 'openai': {
      if (!isOpenAIProvider(provider)) throw new Error('Invalid provider type');
      const result = await provider.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: modelConfigs.dedup.model,
        temperature: modelConfigs.dedup.temperature,
        max_tokens: 1000,
        functions: [{
          name: 'generate',
          parameters: getProviderSchema('openai', responseSchema) as OpenAIFunctionParameter
        }],
        function_call: { name: 'generate' }
      });
      const functionCall = result.choices[0].message.function_call;
      return {
        text: functionCall?.arguments || '',
        tokens: result.usage?.total_tokens || 0
      };
    }
    case 'ollama':
      throw new Error('Ollama support coming soon');
    default:
      throw new Error(`Unsupported provider type: ${providerType}`);
  }
}

function getPrompt(newQueries: string[], existingQueries: string[]): string {
  return `You are an expert in semantic similarity analysis. Given a set of queries (setA) and a set of queries (setB)

<rules>
Function FilterSetA(setA, setB, threshold):
    filteredA = empty set
    
    for each candidateQuery in setA:
        isValid = true
        
        // Check similarity with already accepted queries in filteredA
        for each acceptedQuery in filteredA:
            similarity = calculateSimilarity(candidateQuery, acceptedQuery)
            if similarity >= threshold:
                isValid = false
                break
        
        // If passed first check, compare with set B
        if isValid:
            for each queryB in setB:
                similarity = calculateSimilarity(candidateQuery, queryB)
                if similarity >= threshold:
                    isValid = false
                    break
        
        // If passed all checks, add to filtered set
        if isValid:
            add candidateQuery to filteredA
    
    return filteredA
</rules>    

<similarity-definition>
1. Consider semantic meaning and query intent, not just lexical similarity
2. Account for different phrasings of the same information need
3. Queries with same base keywords but different operators are NOT duplicates
4. Different aspects or perspectives of the same topic are not duplicates
5. Consider query specificity - a more specific query is not a duplicate of a general one
6. Search operators that make queries behave differently:
   - Different site: filters (e.g., site:youtube.com vs site:github.com)
   - Different file types (e.g., filetype:pdf vs filetype:doc)
   - Different language/location filters (e.g., lang:en vs lang:es)
   - Different exact match phrases (e.g., "exact phrase" vs no quotes)
   - Different inclusion/exclusion (+/- operators)
   - Different title/body filters (intitle: vs inbody:)
</similarity-definition>

Now with threshold set to 0.2; run FilterSetA on the following:
SetA: ${JSON.stringify(newQueries)}
SetB: ${JSON.stringify(existingQueries)}`;
}

export async function dedupQueries(newQueries: string[], existingQueries: string[], tracker?: TokenTracker): Promise<{ unique_queries: string[], tokens: number }> {
  try {
    const provider = ProviderFactory.createProvider();
    const providerType = aiConfig.defaultProvider;
    const prompt = getPrompt(newQueries, existingQueries);
    
    const { text, tokens } = await generateResponse(provider, prompt, providerType);
    const responseData = JSON.parse(text) as DedupResponse;
    if (!responseData) throw new Error('No valid response generated');

    console.log('Dedup:', responseData.unique_queries);
    (tracker || new TokenTracker()).trackUsage('dedup', tokens, providerType);
    return { unique_queries: responseData.unique_queries, tokens };
  } catch (error) {
    console.error('Error in deduplication analysis:', error);
    if (error instanceof Error && error.message.includes('Ollama support')) {
      throw new Error('Ollama provider is not yet supported for deduplication');
    }
    throw error;
  }
}

export async function main() {
  const newQueries = process.argv[2] ? JSON.parse(process.argv[2]) : [];
  const existingQueries = process.argv[3] ? JSON.parse(process.argv[3]) : [];

  try {
    const result = await dedupQueries(newQueries, existingQueries);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Failed to deduplicate queries:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

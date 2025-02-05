import { ProviderFactory, AIProvider, isGeminiProvider, isOpenAIProvider } from '../utils/provider-factory';
import { aiConfig, modelConfigs } from "../config";
import { TokenTracker } from "../utils/token-tracker";
import { ErrorAnalysisResponse, ProviderType, OpenAIFunctionParameter } from '../types';
import { z } from 'zod';
import { getProviderSchema } from '../utils/schema';

const responseSchema = z.object({
  recap: z.string().describe("Recap of the actions taken and the steps conducted"),
  blame: z.string().describe("Which action or the step was the root cause of the answer rejection"),
  improvement: z.string().describe("Suggested key improvement for the next iteration, do not use bullet points, be concise and hot-take vibe.")
});

function getPrompt(diaryContext: string[]): string {
  return `You are an expert at analyzing search and reasoning processes. Your task is to analyze the given sequence of steps and identify what went wrong in the search process.

<rules>
1. The sequence of actions taken
2. The effectiveness of each step
3. The logic between consecutive steps
4. Alternative approaches that could have been taken
5. Signs of getting stuck in repetitive patterns
6. Whether the final answer matches the accumulated information

Analyze the steps and provide detailed feedback following these guidelines:
- In the recap: Summarize key actions chronologically, highlight patterns, and identify where the process started to go wrong
- In the blame: Point to specific steps or patterns that led to the inadequate answer
- In the improvement: Provide actionable suggestions that could have led to a better outcome

Generate a JSON response following JSON schema.
</rules>

<example>
<input>
<steps>

At step 1, you took the **search** action and look for external information for the question: "how old is jina ai ceo?".
In particular, you tried to search for the following keywords: "jina ai ceo age".
You found quite some information and add them to your URL list and **visit** them later when needed. 


At step 2, you took the **visit** action and deep dive into the following URLs:
https://www.linkedin.com/in/hxiao87
https://www.crunchbase.com/person/han-xiao
You found some useful information on the web and add them to your knowledge for future reference.


At step 3, you took the **search** action and look for external information for the question: "how old is jina ai ceo?".
In particular, you tried to search for the following keywords: "Han Xiao birthdate, Jina AI founder birthdate".
You found quite some information and add them to your URL list and **visit** them later when needed. 


At step 4, you took the **search** action and look for external information for the question: "how old is jina ai ceo?".
In particular, you tried to search for the following keywords: han xiao birthday. 
But then you realized you have already searched for these keywords before.
You decided to think out of the box or cut from a completely different angle.


At step 5, you took the **search** action and look for external information for the question: "how old is jina ai ceo?".
In particular, you tried to search for the following keywords: han xiao birthday. 
But then you realized you have already searched for these keywords before.
You decided to think out of the box or cut from a completely different angle.


At step 6, you took the **visit** action and deep dive into the following URLs:
https://kpopwall.com/han-xiao/
https://www.idolbirthdays.net/han-xiao
You found some useful information on the web and add them to your knowledge for future reference.


At step 7, you took **answer** action but evaluator thinks it is not a good answer:

</steps>

Original question: 
how old is jina ai ceo?

Your answer: 
The age of the Jina AI CEO cannot be definitively determined from the provided information.

The evaluator thinks your answer is bad because: 
The answer is not definitive and fails to provide the requested information.  Lack of information is unacceptable, more search and deep reasoning is needed.
</input>


<output>
{
  "recap": "The search process consisted of 7 steps with multiple search and visit actions. The initial searches focused on basic biographical information through LinkedIn and Crunchbase (steps 1-2). When this didn't yield the specific age information, additional searches were conducted for birthdate information (steps 3-5). The process showed signs of repetition in steps 4-5 with identical searches. Final visits to entertainment websites (step 6) suggested a loss of focus on reliable business sources.",
  
  "blame": "The root cause of failure was getting stuck in a repetitive search pattern without adapting the strategy. Steps 4-5 repeated the same search, and step 6 deviated to less reliable entertainment sources instead of exploring business journals, news articles, or professional databases. Additionally, the process didn't attempt to triangulate age through indirect information like education history or career milestones.",
  
  "improvement": "1. Avoid repeating identical searches and implement a strategy to track previously searched terms. 2. When direct age/birthdate searches fail, try indirect approaches like: searching for earliest career mentions, finding university graduation years, or identifying first company founding dates. 3. Focus on high-quality business sources and avoid entertainment websites for professional information. 4. Consider using industry event appearances or conference presentations where age-related context might be mentioned. 5. If exact age cannot be determined, provide an estimated range based on career timeline and professional achievements."
}
</output>
</example>
Review the steps below carefully and generate your analysis following this format.

${diaryContext.join('\n')}
`;
}

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
          temperature: modelConfigs.errorAnalyzer.temperature,
          maxOutputTokens: 1000
        }
      });
      const response = await result.response;
      const text = response.text();
      const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/) || text.match(/(\{[\s\S]*\})/);
      return {
        text: jsonMatch ? jsonMatch[1].trim() : text,
        tokens: response.usageMetadata?.totalTokenCount || 0
      };
    }
    case 'openai': {
      if (!isOpenAIProvider(provider)) throw new Error('Invalid provider type');
      const result = await provider.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: modelConfigs.errorAnalyzer.model,
        temperature: modelConfigs.errorAnalyzer.temperature,
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

export async function analyzeSteps(diaryContext: string[], tracker?: TokenTracker): Promise<{ response: ErrorAnalysisResponse, tokens: number }> {
  try {
    const provider = ProviderFactory.createProvider();
    const providerType = aiConfig.defaultProvider;
    const prompt = getPrompt(diaryContext);
    
    const { text, tokens } = await generateResponse(provider, prompt, providerType);
    const responseData = JSON.parse(text) as ErrorAnalysisResponse;
    if (!responseData) throw new Error('No valid response generated');
    
    console.log('Error analysis:', {
      is_valid: !responseData.blame,
      reason: responseData.blame || 'No issues found'
    });
    
    (tracker || new TokenTracker()).trackUsage('error-analyzer', tokens, providerType);
    return { response: responseData, tokens };
  } catch (error) {
    console.error('Error in answer evaluation:', error);
    throw error;
  }
}

import { z } from 'zod';
import { ObjectGeneratorSafe } from './safe-generator';
import { EvaluationType } from '../types';

export const MAX_URLS_PER_STEP = 2;
export const MAX_QUERIES_PER_STEP = 5;
export const MAX_REFLECT_PER_STEP = 3;

function getLanguagePrompt(question: string) {
  return `Identifies both the language used and the overall vibe of the question

<rules>
Combine both language and emotional vibe in a descriptive phrase, considering:
  - Language: The primary language or mix of languages used
  - Emotional tone: panic, excitement, frustration, curiosity, etc.
  - Formality level: academic, casual, professional, etc.
  - Domain context: technical, academic, social, etc.
</rules>

<examples>
Question: "fam PLEASE help me calculate the eigenvalues of this 4x4 matrix ASAP!! [matrix details] got an exam tmrw 😭"
Evaluation: {
    "langCode": "en",
    "langStyle": "panicked student English with math jargon"
}

Question: "Can someone explain how tf did Ferrari mess up their pit stop strategy AGAIN?! 🤦‍♂️ #MonacoGP"
Evaluation: {
    "langCode": "en",
    "languageStyle": "frustrated fan English with F1 terminology"
}

Question: "肖老师您好，请您介绍一下最近量子计算领域的三个重大突破，特别是它们在密码学领域的应用价值吗？🤔"
Evaluation: {
    "langCode": "zh",
    "languageStyle": "formal technical Chinese with academic undertones"
}

Question: "Bruder krass, kannst du mir erklären warum meine neural network training loss komplett durchdreht? Hab schon alles probiert 😤"
Evaluation: {
    "langCode": "de",
    "languageStyle": "frustrated German-English tech slang"
}

Question: "Does anyone have insights into the sociopolitical implications of GPT-4's emergence in the Global South, particularly regarding indigenous knowledge systems and linguistic diversity? Looking for a nuanced analysis."
Evaluation: {
    "langCode": "en",
    "languageStyle": "formal academic English with sociological terminology"
}

Question: "what's 7 * 9? need to check something real quick"
Evaluation: {
    "langCode": "en",
    "languageStyle": "casual English"
}
</examples>

Now evaluate this question:
${question}`;
}

export class Schemas {
  private languageStyle: string = 'formal English';
  public languageCode: string = 'en';

  constructor(query: string) {
    const generator = new ObjectGeneratorSafe();

    generator
      .generateObject({
        model: 'evaluator',
        schema: this.getLanguageSchema(),
        prompt: getLanguagePrompt(query.slice(0, 100)),
      })
      .then((result) => {
        this.languageCode = result.object.langCode;
        this.languageStyle = result.object.langStyle;
        console.log(`langauge`, result.object);
      });
  }

  getLanguagePrompt() {
    return `Must in the first-person in "lang:${this.languageCode}"; in the style of "${this.languageStyle}".`;
  }

  getLanguageSchema() {
    return z.object({
      langCode: z.string().describe('ISO 639-1 language code').max(10),
      langStyle: z
        .string()
        .describe(
          '[vibe & tone] in [what language], such as formal english, informal chinese, technical german, humor english, slang, genZ, emojis etc.',
        )
        .max(100),
    });
  }

  getQuestionEvaluateSchema(): z.ZodObject<any> {
    return z.object({
      needsFreshness: z
        .boolean()
        .describe('If the question requires freshness check'),
      needsPlurality: z
        .boolean()
        .describe('If the question requires plurality check'),
      needsCompleteness: z
        .boolean()
        .describe('If the question requires completeness check'),
      think: z
        .string()
        .describe(
          `A very concise explain of why you choose those checks are needed. ${this.getLanguagePrompt()}`,
        )
        .max(500),
    });
  }

  getCodeGeneratorSchema(): z.ZodObject<any> {
    return z.object({
      think: z
        .string()
        .describe(
          `Short explain or comments on the thought process behind the code. ${this.getLanguagePrompt()}`,
        )
        .max(200),
      code: z
        .string()
        .describe(
          "The JavaScript code that solves the problem and always use 'return' statement to return the result. Focus on solving the core problem; No need for error handling or try-catch blocks or code comments. No need to declare variables that are already available, especially big long strings or arrays.",
        ),
    });
  }

  getErrorAnalysisSchema(): z.ZodObject<any> {
    return z.object({
      recap: z
        .string()
        .describe(
          'Recap of the actions taken and the steps conducted in first person narrative.',
        )
        .max(500),
      blame: z
        .string()
        .describe(
          `Which action or the step was the root cause of the answer rejection. ${this.getLanguagePrompt()}`,
        )
        .max(500),
      improvement: z
        .string()
        .describe(
          `Suggested key improvement for the next iteration, do not use bullet points, be concise and hot-take vibe. ${this.getLanguagePrompt()}`,
        )
        .max(500),
      questionsToAnswer: z
        .array(
          z
            .string()
            .describe(
              'each question must be a single line, concise and clear. not composite or compound, less than 20 words.',
            ),
        )
        .max(MAX_REFLECT_PER_STEP)
        .describe(
          `List of most important reflect questions to fill the knowledge gaps. Maximum provide ${MAX_REFLECT_PER_STEP} reflect questions.`,
        ),
    });
  }

  getQueryRewriterSchema(): z.ZodObject<any> {
    return z.object({
      think: z
        .string()
        .describe(
          `Explain why you choose those search queries. ${this.getLanguagePrompt()}`,
        )
        .max(500),
      queries: z
        .array(
          z
            .string()
            .describe(
              'keyword-based search query, 2-3 words preferred, total length < 30 characters',
            ),
        )
        .min(1)
        .max(MAX_QUERIES_PER_STEP)
        .describe(
          `'Array of search keywords queries, orthogonal to each other. Maximum ${MAX_QUERIES_PER_STEP} queries allowed.'`,
        ),
    });
  }

  getEvaluatorSchema(evalType: EvaluationType): z.ZodObject<any> {
    const baseSchema = {
      pass: z
        .boolean()
        .describe(
          'Whether the answer passes the evaluation criteria defined by the evaluator',
        ),
      think: z
        .string()
        .describe(
          `Explanation the thought process why the answer does not pass the evaluation criteria, ${this.getLanguagePrompt()}`,
        )
        .max(500),
    };
    switch (evalType) {
      case 'definitive':
        return z.object({
          ...baseSchema,
          type: z.literal('definitive'),
        });
      case 'freshness':
        return z.object({
          ...baseSchema,
          type: z.literal('freshness'),
          freshness_analysis: z.object({
            days_ago: z
              .number()
              .describe(
                'Inferred dates or timeframes mentioned in the answer and relative to the current time',
              ),
            max_age_days: z
              .number()
              .optional()
              .describe(
                'Maximum allowed age in days before content is considered outdated',
              ),
          }),
        });
      case 'plurality':
        return z.object({
          ...baseSchema,
          type: z.literal('plurality'),
          plurality_analysis: z.object({
            count_expected: z
              .number()
              .optional()
              .describe('Number of items expected if specified in question'),
            count_provided: z
              .number()
              .describe('Number of items provided in answer'),
          }),
        });
      case 'attribution':
        return z.object({
          ...baseSchema,
          type: z.literal('attribution'),
          attribution_analysis: z.object({
            sources_provided: z
              .boolean()
              .describe('Whether the answer provides source references'),
            sources_verified: z
              .boolean()
              .describe(
                'Whether the provided sources contain the claimed information',
              ),
            quotes_accurate: z
              .boolean()
              .describe(
                'Whether the quotes accurately represent the source content',
              ),
          }),
        });
      case 'completeness':
        return z.object({
          ...baseSchema,
          type: z.literal('completeness'),
          completeness_analysis: z.object({
            aspects_expected: z
              .string()
              .describe(
                'Comma-separated list of all aspects or dimensions that the question explicitly asks for.',
              ),
            aspects_provided: z
              .string()
              .describe(
                'Comma-separated list of all aspects or dimensions that were actually addressed in the answer',
              ),
          }),
        });
      default:
        throw new Error(`Unknown evaluation type: ${evalType}`);
    }
  }

  getAgentSchema(
    allowReflect: boolean,
    allowRead: boolean,
    allowAnswer: boolean,
    allowSearch: boolean,
    allowCoding: boolean,
  ) {
    const actions: string[] = [];
    const properties: Record<string, z.ZodTypeAny> = {
      action: z.enum(['placeholder']), // Will update later with actual actions
      think: z
        .string()
        .describe(
          `Explain why choose this action, what's the chain-of-thought behind choosing this action, ${this.getLanguagePrompt()}`,
        )
        .max(500),
    };

    if (allowSearch) {
      actions.push('search');
      properties.searchRequests = z
        .array(
          z
            .string()
            .max(30)
            .describe(
              `A natual language search request in ${this.languageStyle}. Based on the deep intention behind the original question and the expected answer format.`,
            ),
        )
        .describe(
          `Required when action='search'. Always prefer a single request, only add another request if the original question covers multiple aspects or elements and one search request is definitely not enough, each request focus on one specific aspect of the original question. Minimize mutual information between each request. Maximum ${MAX_QUERIES_PER_STEP} search requests.`,
        )
        .max(MAX_QUERIES_PER_STEP);
    }

    if (allowCoding) {
      actions.push('coding');
      properties.codingIssue = z
        .string()
        .max(500)
        .describe(
          "Required when action='coding'. Describe what issue to solve with coding, format like a github issue ticket. Specify the input value when it is short.",
        )
        .optional();
    }

    if (allowAnswer) {
      actions.push('answer');
      properties.references = z
        .array(
          z
            .object({
              exactQuote: z
                .string()
                .describe(
                  'Exact relevant quote from the document, must be a soundbite, short and to the point, no fluff',
                )
                .max(30),
              url: z
                .string()
                .describe('source URL; must be directly from the context'),
            })
            .required(),
        )
        .describe(
          "Required when action='answer'. Must be an array of references that support the answer, each reference must contain an exact quote and the URL of the document",
        )
        .optional();
      properties.answer = z
        .string()
        .describe(
          `Required when action='answer'. Must be definitive, no ambiguity, uncertainty, or disclaimers. Must in ${this.languageStyle} and confident. Use markdown footnote syntax like [^1], [^2] to refer the corresponding reference item`,
        )
        .optional();
    }

    if (allowReflect) {
      actions.push('reflect');
      properties.questionsToAnswer = z
        .array(
          z
            .string()
            .describe(
              'each question must be a single line, Questions must be: Original (not variations of existing questions); Focused on single concepts; Under 20 words; Non-compound/non-complex',
            ),
        )
        .max(MAX_REFLECT_PER_STEP)
        .describe(
          `Required when action='reflect'. List of most important questions to fill the knowledge gaps of finding the answer to the original question. Maximum provide ${MAX_REFLECT_PER_STEP} reflect questions.`,
        )
        .optional();
    }

    if (allowRead) {
      actions.push('visit');
      properties.URLTargets = z
        .array(z.string())
        .max(MAX_URLS_PER_STEP)
        .describe(
          `Required when action='visit'. Must be an array of URLs, choose up the most relevant ${MAX_URLS_PER_STEP} URLs to visit`,
        )
        .optional();
    }

    // Update the enum values after collecting all actions
    properties.action = z
      .enum(actions as [string, ...string[]])
      .describe('Must match exactly one action type');

    return z.object(properties);
  }
}

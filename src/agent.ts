import { CoreAssistantMessage, CoreUserMessage } from 'ai';
import { SafeSearchType, search as duckSearch } from 'duck-duck-scrape';
import fs from 'fs/promises';
import { ZodObject } from 'zod';
import { SEARCH_PROVIDER, STEP_SLEEP } from './config';
import { braveSearch } from './tools/brave-search';
import { analyzeSteps } from './tools/error-analyzer';
import { evaluateAnswer, evaluateQuestion } from './tools/evaluator';
import { dedupQueries } from './tools/jina-dedup';
import { search } from './tools/jina-search';
import { rewriteQuery } from './tools/query-rewriter';
import { readUrl, removeAllLineBreaks } from './tools/read';
import {
  AnswerAction,
  EvaluationType,
  KnowledgeItem,
  ReflectAction,
  SearchAction,
  SearchResult,
  StepAction,
  TrackerContext,
  VisitAction,
} from './types';
import { ActionTracker } from './utils/action-tracker';
import { TokenTracker } from './utils/token-tracker';
// import {grounding} from "./tools/grounding";
import dedent from 'dedent';
import { setTimeout } from 'timers/promises';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getPrompt } from './get-prompt';
import { serperSearch } from './tools/serper-search';
import { ObjectGeneratorSafe } from './utils/safe-generator';
import {
  MAX_QUERIES_PER_STEP,
  MAX_REFLECT_PER_STEP,
  MAX_URLS_PER_STEP,
  Schemas,
} from './utils/schemas';
import { buildMdFromAnswer, chooseK, removeHTMLtags } from './utils/text-tools';
import { getUnvisitedURLs, normalizeUrl } from './utils/url-tools';

const allContext: StepAction[] = []; // all steps in the current session, including those leads to wrong results

function updateContext(step: any) {
  allContext.push(step);
}

/**
 * Used to break out of the while loop
 */
class EarlyBreak extends Error {}

type State = {
  step: number;
  totalStep: number;
  badAttempts: number;
  context: TrackerContext;
  gaps: string[];
  allQuestions: string[];
  allSearchQueries: string[];
  allKnowledge: KnowledgeItem[];
  badContext: any[];
  diaryContext: string[];
  allowAnswer: boolean;
  allowSearch: boolean;
  allowRead: boolean;
  allowReflect: boolean;
  allowCoding: boolean;
  thisStep: StepAction;
  allURLs: Record<string, SearchResult>;
  visitedURLs: string[];
  evaluationMetrics: Record<string, EvaluationType[]>;
  tokenBudget: number;
};

class AgentRunner {
  private state: State;

  private get regularBudget() {
    return this.state.tokenBudget * 0.9;
  }

  initialQuestion: string;
  currentQuestion: string = '';
  messages: Array<CoreAssistantMessage | CoreUserMessage>;
  SchemaGen: Schemas;
  generator: ObjectGeneratorSafe;
  maxBadAttempts: number;
  lastSystemPromptUsed: string = '';
  lastSchemaUsed: ZodObject<any> = {} as ZodObject<any>;

  constructor(opts: {
    question: string;
    existingContext: Partial<TrackerContext> | undefined;
    tokenBudget: number | undefined;
    messages: Array<CoreAssistantMessage | CoreUserMessage>;
    maxBadAttempts: number;
  }) {
    this.state = {
      step: 0,
      totalStep: 0,
      badAttempts: 0,
      context: {
        tokenTracker: opts.existingContext?.tokenTracker || new TokenTracker(),
        actionTracker:
          opts.existingContext?.actionTracker || new ActionTracker(),
      },
      allSearchQueries: [],
      allQuestions: [],
      allKnowledge: [],
      badContext: [],
      diaryContext: [],
      allowAnswer: true,
      allowSearch: true,
      allowRead: true,
      allowReflect: true,
      allowCoding: true,
      thisStep: {
        action: 'answer',
        answer: '',
        references: [],
        think: '',
        isFinal: false,
      },
      gaps: [opts.question],
      allURLs: {},
      visitedURLs: [],
      evaluationMetrics: {},
      tokenBudget: opts.tokenBudget || 1_000_000,
    };

    this.initialQuestion = opts.question;
    this.SchemaGen = new Schemas(opts.question);
    this.generator = new ObjectGeneratorSafe(this.state.context.tokenTracker);
    this.messages = opts.messages;
    this.maxBadAttempts = opts.maxBadAttempts;
  }

  should = {
    continueNextStep: () => {
      return (
        this.state.context.tokenTracker.getTotalUsage().totalTokens <
          this.regularBudget && this.state.badAttempts <= this.maxBadAttempts
      );
    },
    allowReflect: () => {
      return this.state.allowReflect && this.state.gaps.length <= 1;
    },
    allowSearch: () => {
      return (
        this.state.allowSearch &&
        // disable search when too many urls already
        getUnvisitedURLs(this.state.allURLs, this.state.visitedURLs).length < 50
      );
    },
    runReflectStep: () => {
      return (
        this.state.thisStep.action === 'reflect' &&
        this.state.thisStep.questionsToAnswer
      );
    },
    runSearchStep: () => {
      return (
        this.state.thisStep.action === 'search' &&
        this.state.thisStep.searchRequests
      );
    },
    runVisitStep: () => {
      return (
        this.state.thisStep.action === 'visit' &&
        this.state.thisStep.URLTargets?.length
      );
    },
    runCodingStep: () => {
      return (
        this.state.thisStep.action === 'coding' &&
        this.state.thisStep.codingIssue
      );
    },
    runBeastMode: () => {
      return (
        this.state.thisStep.action === 'answer' && !this.state.thisStep.isFinal
      );
    },
  };

  loggers = {
    gaps: () => {
      console.log('Gaps:', this.state.gaps);
    },
    budget: () => {
      const budgetPercentage = (
        (this.state.context.tokenTracker.getTotalUsage().totalTokens /
          this.state.tokenBudget) *
        100
      ).toFixed(2);
      console.log(
        `Step ${this.state.totalStep} / Budget used ${budgetPercentage}%`,
      );
    },
    currentAction: () => {
      const actionsStr = [
        this.state.allowSearch,
        this.state.allowRead,
        this.state.allowAnswer,
        this.state.allowReflect,
        this.state.allowCoding,
      ]
        .map((a, i) => (a ? ['search', 'read', 'answer', 'reflect'][i] : null))
        .filter((a) => a)
        .join(', ');
      console.log(`${this.state.thisStep.action} <- [${actionsStr}]`);
      console.log(this.state.thisStep);
    },
    beastMode: () => {
      console.log('Enter Beast mode!!!');
    },
  };

  updateCurrentQuestion = () => {
    this.currentQuestion =
      this.state.gaps.length > 0
        ? this.state.gaps.shift()!
        : this.initialQuestion;
  };

  getEvaluationMetricsForQuestion = async (currentQuestion: string) => {
    this.state.evaluationMetrics[currentQuestion] = await evaluateQuestion(
      currentQuestion,
      this.state.context,
      new Schemas(currentQuestion),
    );
  };

  askAgentForNextStep = async () => {
    const systemPrompt = getPrompt(
      this.state.diaryContext,
      this.state.allQuestions,
      this.state.allSearchQueries,
      this.state.allowReflect,
      this.state.allowAnswer,
      this.state.allowRead,
      this.state.allowSearch,
      this.state.allowCoding,
      this.state.badContext,
      this.state.allKnowledge,
      getUnvisitedURLs(this.state.allURLs, this.state.visitedURLs),
      false,
    );

    const schema = this.SchemaGen.getAgentSchema(
      this.state.allowReflect,
      this.state.allowRead,
      this.state.allowAnswer,
      this.state.allowSearch,
      this.state.allowCoding,
    );

    this.lastSystemPromptUsed = systemPrompt;
    this.lastSchemaUsed = schema;

    const result = await this.generator.generateObject({
      model: 'agent',
      schema,
      system: systemPrompt,
      messages: this.messages,
    });

    this.state.thisStep = result.object as StepAction;
  };

  trackActionAgentChose = () => {
    this.state.context.actionTracker.trackAction({
      totalStep: this.state.totalStep,
      thisStep: this.state.thisStep,
      gaps: this.state.gaps,
      badAttempts: this.state.badAttempts,
    });
  };

  resetAllowedActions = () => {
    this.state.allowAnswer = true;
    this.state.allowReflect = true;
    this.state.allowRead = true;
    this.state.allowSearch = true;
    // this.state.allowCoding = true;
  };

  doesQuestionHaveEvaluationMetrics = (question: string) => {
    return !!this.state.evaluationMetrics[question];
  };

  runAnswerStep = async () => {
    const thisStep = this.state.thisStep as AnswerAction;

    if (this.state.step === 1) {
      // LLM is so confident and answer immediately, skip all evaluations
      thisStep.isFinal = true;
      throw new EarlyBreak('Early break');
    }

    updateContext({
      totalStep: this.state.totalStep,
      question: this.currentQuestion,
      ...thisStep,
    });

    // normalize all references urls, add title to it
    thisStep.references = thisStep.references?.map((ref) => {
      return {
        exactQuote: ref.exactQuote,
        title: this.state.allURLs[ref.url]?.title,
        url: ref.url ? normalizeUrl(ref.url) : '',
      };
    });

    this.state.context.actionTracker.trackThink(
      'eval_first',
      this.SchemaGen.languageCode,
    );

    const evaluation = await evaluateAnswer(
      this.currentQuestion,
      thisStep,
      this.state.evaluationMetrics[this.currentQuestion],
      this.state.context,
      this.state.visitedURLs,
      this.SchemaGen,
    );

    // If the current question we're on is the initial question,
    // then if evaluations pass, we're done.
    if (this.currentQuestion.trim() === this.initialQuestion) {
      if (evaluation.pass) {
        this.state.diaryContext.push(dedent`
          At step ${this.state.step}, you took **answer** action and
          finally found the answer to the original question:

          Original question: 
          ${this.currentQuestion}

          Your answer: 
          ${thisStep.answer}

          The evaluator thinks your answer is good because: 
          ${evaluation.think}

          Your journey ends here. You have successfully
          answered the original question. Congratulations! 🎉
        `);
        thisStep.isFinal = true;
        throw new EarlyBreak('Early break');
      } else {
        if (this.state.badAttempts >= this.maxBadAttempts) {
          thisStep.isFinal = false;
          throw new EarlyBreak('Max bad attempts exceeded');
        } else {
          this.state.diaryContext.push(dedent`
            At step ${this.state.step}, you took **answer** action but evaluator thinks it is not a good answer:

            Original question: 
            ${this.currentQuestion}

            Your answer: 
            ${thisStep.answer}

            The evaluator thinks your answer is bad because: 
            ${evaluation.think}
          `);
          // store the bad context and reset the diary context
          const errorAnalysis = await analyzeSteps(
            this.state.diaryContext,
            this.state.context,
            this.SchemaGen,
          );

          this.state.allKnowledge.push({
            question: this.currentQuestion,
            answer: thisStep.answer,
            references: thisStep.references,
            type: 'qa',
            updated: new Date().toISOString(),
          });

          this.state.badContext.push({
            question: this.currentQuestion,
            answer: thisStep.answer,
            evaluation: evaluation.think,
            ...errorAnalysis,
          });

          if (errorAnalysis.questionsToAnswer) {
            // reranker? maybe
            errorAnalysis.questionsToAnswer = chooseK(
              errorAnalysis.questionsToAnswer,
              MAX_REFLECT_PER_STEP,
            );
            this.state.gaps.push(...errorAnalysis.questionsToAnswer);
            this.state.allQuestions.push(...errorAnalysis.questionsToAnswer);
            this.state.gaps.push(this.initialQuestion); // always keep the original question in the gaps
          }

          this.state.badAttempts++;
          this.state.allowAnswer = false; // disable answer action in the immediate next step
          this.state.diaryContext = [];
          this.state.step = 0;
        }
      }
      // If the current question is not the initial question,
      // but we got some good information, add it to the diary
      // and move on
    } else if (evaluation.pass) {
      this.state.diaryContext.push(dedent`
        At step ${this.state.step}, you took **answer** action. You
        found a good answer to the sub-question:

        Sub-question: 
        ${this.currentQuestion}

        Your answer: 
        ${thisStep.answer}

        The evaluator thinks your answer is good because: 
        ${evaluation.think}

        Although you solved a sub-question, you still need
        to find the answer to the original question.
        You need to keep going.
      `);
      this.state.allKnowledge.push({
        question: this.currentQuestion,
        answer: thisStep.answer,
        references: thisStep.references,
        type: 'qa',
        updated: new Date().toISOString(),
      });
    }
  };

  runReflectStep = async () => {
    const thisStep = this.state.thisStep as ReflectAction;

    thisStep.questionsToAnswer = chooseK(
      (
        await dedupQueries(
          thisStep.questionsToAnswer,
          this.state.allQuestions,
          this.state.context.tokenTracker,
        )
      ).unique_queries,
      MAX_REFLECT_PER_STEP,
    );
    const newGapQuestions = thisStep.questionsToAnswer;
    if (newGapQuestions.length > 0) {
      // found new gap questions
      this.state.diaryContext.push(dedent`
        At step ${this.state.step}, you took **reflect** and think
        about the knowledge gaps.
        You found some sub-questions are important to the
        question: "${this.currentQuestion}"
        You realize you need to know the answers to the
        following sub-questions:
        ${newGapQuestions.map((q: string) => `- ${q}`).join('\n')}

        You will now figure out the answers to these
        sub-questions and see if they can help you find
        the answer to the original question.
      `);
      this.state.gaps.push(...newGapQuestions);
      this.state.allQuestions.push(...newGapQuestions);
      this.state.gaps.push(this.initialQuestion); // always keep the original question in the gaps
      updateContext({
        totalStep: this.state.totalStep,
        ...thisStep,
      });
    } else {
      this.state.diaryContext.push(`
  At step ${this.state.step}, you took **reflect** and think about the knowledge gaps. You tried to break down the question "${this.currentQuestion}" into gap-questions like this: ${newGapQuestions.join(', ')} 
  But then you realized you have asked them before. You decided to to think out of the box or cut from a completely different angle. 
  `);
      updateContext({
        totalStep: this.state.totalStep,
        ...thisStep,
        result:
          'You have tried all possible questions and found no useful information. You must think out of the box or different angle!!!',
      });

      this.state.allowReflect = false;
    }
  };

  runSearchStep = async () => {
    const thisStep = this.state.thisStep as SearchAction;

    // dedup search requests
    thisStep.searchRequests = chooseK(
      (
        await dedupQueries(
          thisStep.searchRequests,
          [],
          this.state.context.tokenTracker,
        )
      ).unique_queries,
      MAX_QUERIES_PER_STEP,
    );

    // rewrite queries
    let { queries: keywordsQueries } = await rewriteQuery(
      thisStep,
      this.state.context,
      this.SchemaGen,
    );
    // avoid existing searched queries
    keywordsQueries = chooseK(
      (
        await dedupQueries(
          keywordsQueries,
          this.state.allSearchQueries,
          this.state.context.tokenTracker,
        )
      ).unique_queries,
      MAX_QUERIES_PER_STEP,
    );

    let anyResult = false;

    if (keywordsQueries.length > 0) {
      this.state.context.actionTracker.trackThink(
        'search_for',
        this.SchemaGen.languageCode,
        {
          keywords: keywordsQueries.join(', '),
        },
      );
      for (const query of keywordsQueries) {
        console.log(`Search query: ${query}`);

        let results: SearchResult[] = [];

        try {
          switch (SEARCH_PROVIDER) {
            case 'jina':
              results =
                (await search(query, this.state.context.tokenTracker)).response
                  ?.data || [];
              break;
            case 'duck':
              results = (
                await duckSearch(query, { safeSearch: SafeSearchType.STRICT })
              ).results;
              break;
            case 'brave':
              results = (await braveSearch(query)).response.web?.results || [];
              break;
            case 'serper':
              results = (await serperSearch(query)).response.organic || [];
              break;
            default:
              results = [];
          }
          if (results.length === 0) {
            throw new Error('No results found');
          }
        } catch (error) {
          console.error(
            `${SEARCH_PROVIDER} search failed for query "${query}":`,
            error,
          );
          continue;
        } finally {
          await setTimeout(STEP_SLEEP);
        }

        const minResults = results.map((r) => ({
          title: r.title,
          url: normalizeUrl('url' in r ? r.url : r.link),
          description: 'description' in r ? r.description : r.snippet,
        }));

        minResults.forEach((r) => (this.state.allURLs[r.url] = r));
        this.state.allSearchQueries.push(query);

        this.state.allKnowledge.push({
          question: `What does the Internet say about "${query}"?`,
          answer: removeHTMLtags(
            minResults.map((r) => r.description).join('; '),
          ),
          type: 'side-info',
          updated: new Date().toISOString(),
        });
      }

      this.state.diaryContext.push(`
At step ${this.state.step}, you took the **search** action and look for external information for the question: "${this.currentQuestion}".
In particular, you tried to search for the following keywords: "${keywordsQueries.join(', ')}".
You found quite some information and add them to your URL list and **visit** them later when needed. 
`);

      anyResult = true;
    }
    if (!anyResult || !keywordsQueries?.length) {
      this.state.diaryContext.push(dedent`
        At step ${this.state.step}, you took the **search** action and look for external information for the question: "${this.currentQuestion}".
        In particular, you tried to search for the following keywords: ${keywordsQueries.join(', ')}. 
        But then you realized you have already searched for these keywords before, no new information is returned.
        You decided to think out of the box or cut from a completely different angle.
      `);

      updateContext({
        totalStep: this.state.totalStep,
        ...thisStep,
        result:
          'You have tried all possible queries and found no new information. You must think out of the box or different angle!!!',
      });

      this.state.allowSearch = false;
    }
  };

  runVisitStep = async () => {
    const thisStep = this.state.thisStep as VisitAction;
    // normalize URLs
    thisStep.URLTargets = thisStep.URLTargets.map((url) => normalizeUrl(url));
    thisStep.URLTargets = chooseK(
      thisStep.URLTargets.filter(
        (url) => !this.state.visitedURLs.includes(url),
      ),
      MAX_URLS_PER_STEP,
    );

    const uniqueURLs = thisStep.URLTargets;

    if (uniqueURLs.length > 0) {
      this.state.context.actionTracker.trackThink(
        'read_for',
        this.SchemaGen.languageCode,
        {
          urls: uniqueURLs.join(', '),
        },
      );

      const urlResults = await Promise.all(
        uniqueURLs.map(async (url) => {
          try {
            const { response } = await readUrl(
              url,
              this.state.context.tokenTracker,
            );
            const { data } = response;

            // Early return if no valid data
            if (!data?.url || !data?.content) {
              throw new Error('No content found');
            }

            this.state.allKnowledge.push({
              question: `What is in ${data.url}?`,
              answer: removeAllLineBreaks(data.content),
              references: [data.url],
              type: 'url',
              updated: new Date().toISOString(),
            });

            return { url, result: response };
          } catch (error) {
            console.error('Error reading URL:', error);
            return null;
          } finally {
            this.state.visitedURLs.push(url);
          }
        }),
      ).then((results) => results.filter(Boolean));

      const success = urlResults.length > 0;
      this.state.diaryContext.push(
        success
          ? `At step ${this.state.step}, you took the **visit** action and deep dive into the following URLs:
${urlResults.map((r) => r?.url).join('\n')}
You found some useful information on the web and add them to your knowledge for future reference.`
          : `At step ${this.state.step}, you took the **visit** action and try to visit some URLs but failed to read the content. You need to think out of the box or cut from a completely different angle.`,
      );

      updateContext({
        totalStep: this.state.totalStep,
        ...(success
          ? {
              question: this.currentQuestion,
              ...thisStep,
              result: urlResults,
            }
          : {
              ...thisStep,
              result:
                'You have tried all possible URLs and found no new information. You must think out of the box or different angle!!!',
            }),
      });

      this.state.allowRead = success;
    } else {
      this.state.diaryContext.push(`
At step ${this.state.step}, you took the **visit** action. But then you realized you have already visited these URLs and you already know very well about their contents.
You decided to think out of the box or cut from a completely different angle.`);

      updateContext({
        totalStep: this.state.totalStep,
        ...thisStep,
        result:
          'You have visited all possible URLs and found no new information. You must think out of the box or different angle!!!',
      });

      this.state.allowRead = false;
    }
  };

  runCodingStep = async () => {
    throw new Error('Coding step not implemented');
  };

  printLocalFiles = async () => {
    await storeContext(
      this.lastSystemPromptUsed,
      this.lastSchemaUsed,
      [
        allContext,
        this.state.allSearchQueries,
        this.state.allQuestions,
        this.state.allKnowledge,
      ],
      this.state.totalStep,
    );
  };

  runBeastModeStep = async () => {
    // any answer is better than no answer, humanity last resort
    this.state.step++;
    this.state.totalStep++;
    const system = getPrompt(
      this.state.diaryContext,
      this.state.allQuestions,
      this.state.allSearchQueries,
      false,
      false,
      false,
      false,
      false,
      this.state.badContext,
      this.state.allKnowledge,
      getUnvisitedURLs(this.state.allURLs, this.state.visitedURLs),
      true,
    );

    const schema = this.SchemaGen.getAgentSchema(
      false,
      false,
      true,
      false,
      false,
    );
    const result = await this.generator.generateObject({
      model: 'agentBeastMode',
      schema,
      system,
      messages: this.messages,
    });
    this.state.thisStep = result.object as AnswerAction;
    this.state.thisStep.isFinal = true;

    this.state.context.actionTracker.trackAction({
      totalStep: this.state.totalStep,
      thisStep: this.state.thisStep,
      gaps: this.state.gaps,
      badAttempts: this.state.badAttempts,
    });

    this.lastSchemaUsed = schema;
    this.lastSystemPromptUsed = system;
  };

  getFinalResult = () => {
    if (this.state.thisStep.action !== 'answer') {
      throw new Error('Final step is not an answer');
    }

    if (!this.state.thisStep.isFinal) {
      throw new Error('Attempted to getFinalStep on a step that was not final');
    }
    const finalStep = this.state.thisStep;

    finalStep.mdAnswer = buildMdFromAnswer(finalStep);

    return {
      result: finalStep,
      context: this.state.context,
      visitedURLs: [
        ...new Set([
          ...this.state.visitedURLs,
          ...Object.keys(this.state.allURLs),
        ]),
      ],
      readURLs: this.state.visitedURLs,
    };
  };

  runStep = async () => {
    this.state.step++;
    this.state.totalStep++;

    this.loggers.budget();
    this.loggers.gaps();

    // Update allowed actions
    this.state.allowReflect = this.should.allowReflect();
    this.state.allowSearch = this.should.allowSearch();

    this.updateCurrentQuestion();

    // Evaluate the question if it hasn't been evaluated yet
    if (!this.doesQuestionHaveEvaluationMetrics(this.currentQuestion)) {
      await this.getEvaluationMetricsForQuestion(this.currentQuestion);
    }

    // Ask agent for the next step
    await this.askAgentForNextStep();
    this.loggers.currentAction();
    this.trackActionAgentChose();

    // Reset allowed actions before future computation below
    this.resetAllowedActions();

    if (this.state.thisStep.action === 'answer') {
      await this.runAnswerStep();
    } else if (this.should.runReflectStep()) {
      await this.runReflectStep();
    } else if (this.should.runSearchStep()) {
      await this.runSearchStep();
    } else if (this.should.runVisitStep()) {
      await this.runVisitStep();
    } else if (this.should.runCodingStep()) {
      await this.runCodingStep();
    }

    await setTimeout(STEP_SLEEP);
  };
}

export async function getResponse(
  question?: string,
  tokenBudget: number = 1_000_000,
  maxBadAttempts: number = 3,
  existingContext?: Partial<TrackerContext>,
  _messages?: Array<CoreAssistantMessage | CoreUserMessage>,
): Promise<{
  result: StepAction;
  context: TrackerContext;
  visitedURLs: string[];
  readURLs: string[];
}> {
  let messages: Array<CoreAssistantMessage | CoreUserMessage> = _messages || [];

  question = question?.trim() as string;
  if (messages && messages.length > 0) {
    question = (messages[messages.length - 1]?.content as string).trim();
  } else {
    messages = [{ role: 'user', content: question.trim() }];
  }

  const runner = new AgentRunner({
    existingContext,
    question,
    tokenBudget,
    messages,
    maxBadAttempts,
  });

  while (runner.should.continueNextStep()) {
    try {
      await runner.runStep();
    } catch (e) {
      if (e instanceof EarlyBreak) {
        break;
      }
      throw e;
    }

    await runner.printLocalFiles();
  }

  await runner.printLocalFiles();

  if (runner.should.runBeastMode()) {
    await runner.runBeastModeStep();

    await runner.printLocalFiles();
  }

  const result = runner.getFinalResult();

  return result;
}

async function storeContext(
  prompt: string,
  schema: any,
  memory: any[][],
  step: number,
) {
  try {
    await fs.writeFile(
      `prompt-${step}.txt`,
      `
Prompt:
${prompt}

JSONSchema:
${JSON.stringify(zodToJsonSchema(schema), null, 2)}
`,
    );
    const [context, keywords, questions, knowledge] = memory;
    await fs.writeFile('context.json', JSON.stringify(context, null, 2));
    await fs.writeFile('queries.json', JSON.stringify(keywords, null, 2));
    await fs.writeFile('questions.json', JSON.stringify(questions, null, 2));
    await fs.writeFile('knowledge.json', JSON.stringify(knowledge, null, 2));
  } catch (error) {
    console.error('Context storage failed:', error);
  }
}

export async function main() {
  const question = process.argv[2] || '';
  const {
    result: finalStep,
    context: tracker,
    visitedURLs: visitedURLs,
  } = (await getResponse(question)) as {
    result: AnswerAction;
    context: TrackerContext;
    visitedURLs: string[];
  };
  console.log('Final Answer:', finalStep.answer);
  console.log('Visited URLs:', visitedURLs);

  tracker.tokenTracker.printSummary();
}

if (require.main === module) {
  main().catch(console.error);
}

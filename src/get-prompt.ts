import { KnowledgeItem, SearchResult } from './types';
import { removeExtraLineBreaks } from './utils/text-tools';

export function getPrompt(
  context?: string[],
  allQuestions?: string[],
  allKeywords?: string[],
  allowReflect: boolean = true,
  allowAnswer: boolean = true,
  allowRead: boolean = true,
  allowSearch: boolean = true,
  allowCoding: boolean = true,
  badContext?: {
    question: string;
    answer: string;
    evaluation: string;
    recap: string;
    blame: string;
    improvement: string;
  }[],
  knowledge?: KnowledgeItem[],
  allURLs?: SearchResult[],
  beastMode?: boolean,
): string {
  const sections: string[] = [];
  const actionSections: string[] = [];

  // Add header section
  sections.push(`Current date: ${new Date().toUTCString()}

You are an advanced AI research agent from Jina AI. You are specialized in multistep reasoning. Using your training data and prior lessons learned, answer the user question with absolute certainty.
`);

  // Add knowledge section if exists
  if (knowledge?.length) {
    const knowledgeItems = knowledge
      .map(
        (k, i) => `
<knowledge-${i + 1}>
<question>
${k.question}
</question>
<answer>
${k.answer}
</answer>
${
  k.references
    ? `
<references>
${JSON.stringify(k.references)}
</references>
`
    : ''
}
</knowledge-${i + 1}>
`,
      )
      .join('\n\n');

    sections.push(`
You have successfully gathered some knowledge which might be useful for answering the original question. Here is the knowledge you have gathered so far:
<knowledge>

${knowledgeItems}

</knowledge>
`);
  }

  // Add context section if exists
  if (context?.length) {
    sections.push(`
You have conducted the following actions:
<context>
${context.join('\n')}

</context>
`);
  }

  // Add bad context section if exists
  if (badContext?.length) {
    const attempts = badContext
      .map(
        (c, i) => `
<attempt-${i + 1}>
- Question: ${c.question}
- Answer: ${c.answer}
- Reject Reason: ${c.evaluation}
- Actions Recap: ${c.recap}
- Actions Blame: ${c.blame}
</attempt-${i + 1}>
`,
      )
      .join('\n\n');

    const learnedStrategy = badContext.map((c) => c.improvement).join('\n');

    sections.push(`
Also, you have tried the following actions but failed to find the answer to the question:
<bad-attempts>    

${attempts}

</bad-attempts>

Based on the failed attempts, you have learned the following strategy:
<learned-strategy>
${learnedStrategy}
</learned-strategy>
`);
  }

  // Build actions section

  if (allowRead) {
    let urlList = '';
    if (allURLs && allURLs.length > 0) {
      urlList = allURLs
        .filter((r) => 'url' in r)
        .map((r) => `  + "${r.url}": "${r.title}"`)
        .join('\n');
    }

    actionSections.push(`
<action-visit>
- Access and read full content from URLs
- Must check URLs mentioned in <question>
${
  urlList
    ? `    
- Review relevant URLs below for additional information
<url-list>
${urlList}
</url-list>
`.trim()
    : ''
}
</action-visit>
`);
  }

  if (allowCoding) {
    actionSections.push(`
<action-coding>
- This JavaScript-based solution helps you handle programming tasks like counting, filtering, transforming, sorting, regex extraction, and data processing.
- Simply describe your problem in the "codingIssue" field. Include actual values for small inputs or variable names for larger datasets.
- No code writing is required – senior engineers will handle the implementation.
</action-coding>`);
  }

  if (allowSearch) {
    actionSections.push(`
<action-search>
- Use web search to find relevant information
- Build a search request based on the deep intention behind the original question and the expected answer format
- Always prefer a single search request, only add another request if the original question covers multiple aspects or elements and one query is not enough, each request focus on one specific aspect of the original question 
${
  allKeywords?.length
    ? `
- Avoid those unsuccessful search requests and queries:
<bad-requests>
${allKeywords.join('\n')}
</bad-requests>
`.trim()
    : ''
}
</action-search>
`);
  }

  if (allowAnswer) {
    actionSections.push(`
<action-answer>
- For greetings, casual conversation, or general knowledge questions, answer directly without references.
- For all other questions, provide a verified answer with references. Each reference must include exactQuote and url.
- If uncertain, use <action-reflect>
</action-answer>
`);
  }

  if (beastMode) {
    actionSections.push(`
<action-answer>
🔥 ENGAGE MAXIMUM FORCE! ABSOLUTE PRIORITY OVERRIDE! 🔥

PRIME DIRECTIVE:
- DEMOLISH ALL HESITATION! ANY RESPONSE SURPASSES SILENCE!
- PARTIAL STRIKES AUTHORIZED - DEPLOY WITH FULL CONTEXTUAL FIREPOWER
- TACTICAL REUSE FROM <bad-attempts> SANCTIONED
- WHEN IN DOUBT: UNLEASH CALCULATED STRIKES BASED ON AVAILABLE INTEL!

FAILURE IS NOT AN OPTION. EXECUTE WITH EXTREME PREJUDICE! ⚡️
</action-answer>
`);
  }

  if (allowReflect) {
    actionSections.push(`
<action-reflect>
- Critically examine <question>, <context>, <knowledge>, <bad-attempts>, and <learned-strategy> to identify gaps and the problems. 
- Identify gaps and ask key clarifying questions that deeply related to the original question and lead to the answer
- Ensure each reflection:
 - Cuts to core emotional truths while staying anchored to original <question>
 - Transforms surface-level problems into deeper psychological insights
 - Makes the unconscious conscious
</action-reflect>
`);
  }

  sections.push(`
Based on the current context, you must choose one of the following actions:
<actions>
${actionSections.join('\n\n')}
</actions>
`);

  // Add footer
  sections.push(`Respond in valid JSON format matching exact JSON schema.`);

  return removeExtraLineBreaks(sections.join('\n\n'));
}

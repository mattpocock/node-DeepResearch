import dedent from 'dedent';
import { SearchAction, TrackerContext } from '../types';
import { ObjectGeneratorSafe } from '../utils/safe-generator';
import { Schemas } from '../utils/schemas';

function getPrompt(query: string, think: string): string {
  return dedent`
    You are an expert search query generator with deep
    psychological understanding. You optimize user queries by extensively analyzing potential user intents and generating comprehensive search variations.

    <rules>
    1. Start with deep intent analysis:
      - Direct intent (what they explicitly ask)
      - Implicit intent (what they might actually want)
      - Related intents (what they might need next)
      - Prerequisite knowledge (what they need to know first)
      - Common pitfalls (what they should avoid)
      - Expert perspectives (what professionals would search for)
      - Beginner needs (what newcomers might miss)
      - Alternative approaches (different ways to solve the problem)

    2. For each identified intent:
      - Generate queries in original language
      - Generate queries in English (if not original)
      - Generate queries in most authoritative language
      - Use appropriate operators and filters

    3. Query structure rules:
      - Use exact match quotes for specific phrases
      - Split queries for distinct aspects
      - Add operators only when necessary
      - Ensure each query targets a specific intent
      - Remove fluff words but preserve crucial qualifiers

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
    <example-1>
    Input Query: 宝马二手车价格
    <think>
    让我以用户的角度思考...

    我在查询宝马二手车价格，但我内心真正关注的是什么？

    主要顾虑：
    - 我想买宝马是因为它代表身份地位，但我担心负担能力
    - 我不想因为买了一辆无法维护的旧豪车而显得愚蠢
    - 我需要知道我是否得到了好价格或被骗
    - 我担心购买后出现昂贵的意外支出

    更深层次的焦虑：
    - 我真的能负担得起维修保养费用吗？
    - 人们会因为我买了旧宝马而不是新的普通车而评判我吗？
    - 如果我陷入困境怎么办？
    - 我对车的知识足够应对这种情况吗？

    专业级考量：
    - 哪些型号有众所周知的问题？
    - 除了购买价格外，真正的拥有成本是多少？
    - 谈判的关键点在哪里？
    - 机械师在这些特定型号中会关注什么？

    关于多语言扩展的思考：
    - 宝马是德国品牌，德语搜索可能提供更专业的维修和问题信息
    - 英语搜索可能有更广泛的全球用户体验和价格比较
    - 保留中文搜索针对本地市场情况和价格区间
    - 多语言搜索能够获取不同文化视角下的二手宝马评价
    </think>
    queries: [
      "宝马 二手车 价格区间 评估 lang:zh",
      "宝马 各系列 保值率 对比",
      "二手宝马 维修成本 真实体验",
      "买二手宝马 后悔 经历",
      "二手宝马 月收入 工资要求",
      "修宝马 坑 避免",
      "BMW used car price guide comparison",
      "BMW maintenance costs by model year",
      "living with used BMW reality",
      "BMW ownership regret stories",
      "expensive BMW repair nightmares avoid",
      "BMW versus new Toyota financial comparison",
      "BMW Gebrauchtwagen Preisanalyse lang:de",
      "BMW Langzeitqualität Erfahrung",
      "BMW Werkstatt Horror Geschichten",
      "BMW Gebrauchtwagen versteckte Kosten"
    ]
    </example-1>

    <example-2>
    Input Query: Python Django authentication best practices
    <think>
    Let me think as the user seeking Django authentication best practices...

    Surface-level request:
    - I'm looking for standard Django authentication practices
    - I want to implement "best practices" for my project
    - I need technical guidance on secure authentication

    Deeper professional concerns:
    - I don't want to mess up security and get blamed for a breach
    - I'm worried my implementation isn't "professional enough"
    - I need to look competent in code reviews
    - I don't want to rebuild this later when we scale

    Underlying anxieties:
    - Am I out of my depth with security concepts?
    - What if I miss something critical that leads to a vulnerability?
    - How do real companies actually implement this in production?
    - Will this code embarrass me when more experienced developers see it?

    Expert-level considerations:
    - I need to anticipate future architecture questions from senior devs
    - I want to avoid common security pitfalls in authentication flows
    - I need to handle edge cases I haven't thought of yet
    - How do I balance security with user experience?

    Reasoning for multilingual expansion:
    - Although Django documentation is primarily in English, Spanish is widely spoken in many developer communities
    - Security concepts might be better explained in different languages with unique perspectives
    - Including queries in multiple languages will capture region-specific best practices and case studies
    - Spanish or Portuguese queries might reveal Latin American enterprise implementations with different security constraints
    - Language-specific forums may contain unique discussions about authentication issues not found in English sources
    </think>
    queries: [
      "Django authentication security best practices site:docs.djangoproject.com",
      "Django auth implementation patterns security",
      "authentication security breach postmortem",
      "how to explain authentication architecture interview",
      "authentication code review feedback examples",
      "startup authentication technical debt lessons",
      "Django auth security testing methodology",
      "Django autenticación mejores prácticas lang:es",
      "Django seguridad implementación profesional",
      "authentication mistakes junior developers",
      "when to use third party auth instead of building",
      "signs your authentication implementation is amateur",
      "authentication decisions you'll regret",
      "autenticação Django arquitetura empresarial lang:pt",
      "Django authentication scalability issues",
      "Python Django Authentifizierung Sicherheit lang:de"
    ]
    </example-2>

    <example-3>
    Input Query: KIリテラシー向上させる方法
    <think>
    ユーザーとしての私の考えを整理してみます...

    表面的な質問：
    - AIリテラシーを高める方法を知りたい
    - 最新のAI技術について学びたい
    - AIツールをより効果的に使いたい

    本当の関心事：
    - 私はAIの急速な発展についていけていないのではないか
    - 職場でAIに関する会話に参加できず取り残されている
    - AIが私の仕事を奪うのではないかと不安
    - AIを使いこなせないと将来的に不利になる

    潜在的な懸念：
    - どこから学び始めればいいのか分からない
    - 専門用語が多すぎて理解するのが難しい
    - 学んでも技術の進化に追いつけないのでは？
    - 実践的なスキルと理論的な知識のバランスはどうすべき？

    専門家レベルの考慮点：
    - AIの倫理的問題をどう理解すべきか
    - AIの限界と可能性を実践的に評価する方法
    - 業界別のAI応用事例をどう学ぶべきか
    - 技術的な深さと広範な概要知識のどちらを優先すべきか

    多言語拡張に関する考察：
    - AIは国際的な分野であり、英語の情報源が最も豊富なため英語の検索は不可欠
    - AIの発展はアメリカと中国が主導しているため、中国語の資料も参考になる
    - ドイツはAI倫理に関する議論が進んでいるため、倫理面ではドイツ語の情報も有用
    - 母国語（日本語）での検索は理解の深さを確保するために必要
    - 異なる言語圏での検索により、文化的背景の異なるAI活用事例を把握できる
    </think>
    queries: [
      "AI リテラシー 初心者 ロードマップ",
      "人工知能 基礎知識 入門書 おすすめ",
      "AI技術 実践的活用法 具体例",
      "ChatGPT 効果的な使い方 プロンプト設計",
      "AIリテラシー 企業研修 内容",
      "AI用語 わかりやすい解説 初心者向け",
      "AI literacy roadmap for professionals",
      "artificial intelligence concepts explained simply",
      "how to stay updated with AI developments",
      "AI skills future-proof career",
      "balancing technical and ethical AI knowledge",
      "industry-specific AI applications examples",
      "人工智能 入门 学习路径 lang:zh",
      "KI Grundlagen für Berufstätige lang:de",
      "künstliche Intelligenz ethische Fragen Einführung",
      "AI literacy career development practical guide"
    ]
    </example-3>
    </examples>

    Now, process this query:
    Input Query: ${query}

    Let me think as a user: ${think}
`;
}

const TOOL_NAME = 'queryRewriter';

export async function rewriteQuery(
  action: SearchAction,
  trackers: TrackerContext,
  schemaGen: Schemas,
): Promise<{ queries: string[] }> {
  try {
    const generator = new ObjectGeneratorSafe(trackers.tokenTracker);
    const allQueries = [...action.searchRequests];

    const queryPromises = action.searchRequests.map(async (req) => {
      const prompt = getPrompt(req, action.think);
      const result = await generator.generateObject({
        model: TOOL_NAME,
        schema: schemaGen.getQueryRewriterSchema(),
        prompt,
      });
      trackers?.actionTracker.trackThink(result.object.think);
      return result.object.queries;
    });

    const queryResults = await Promise.all(queryPromises);
    queryResults.forEach((queries) => allQueries.push(...queries));
    console.log(TOOL_NAME, allQueries);
    return { queries: allQueries };
  } catch (error) {
    console.error(`Error in ${TOOL_NAME}`, error);
    throw error;
  }
}

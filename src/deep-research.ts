import FirecrawlApp, { SearchResponse } from '@mendable/firecrawl-js';
import { generateObject, generateText } from 'ai';
import { compact } from 'lodash-es';
import pLimit from 'p-limit';
import { z } from 'zod';

import { model, trimPrompt } from './ai/providers';
import { systemPrompt } from './prompt';

type ResearchResult = {
  learnings: string[];
  visitedUrls: string[];
};

// increase this if you have higher API rate limits
const ConcurrencyLimit = 2;

// Initialize Firecrawl with optional API key and optional base url

const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_KEY ?? '',
  apiUrl: process.env.FIRECRAWL_BASE_URL,
});

// take en user query, return a list of SERP queries
async function generateSerpQueries({
  query,
  numQueries = 3,
  learnings,
}: {
  query: string;
  numQueries?: number;

  // optional, if provided, the research will continue from the last learning
  learnings?: string[];
}) {
  const res = await generateObject({
    model: model,
    output: 'no-schema',
    system: systemPrompt(),
    prompt: `根据用户提供的以下prompt，生成一组用于研究该主题的搜索引擎查询。最多返回 ${numQueries} 个查询，但如果原始提示清晰，也可以返回更少的查询。确保每个查询都是独特的，彼此之间不相似： <prompt>${query}</prompt>\n\n${
      learnings
        ? `以下是之前研究中的一些认知，请利用它们生成更具体的查询： ${learnings.join(
            '\n',
          )}`
        : ''
    }
    示例JSON如下所示。仅输出JSON，不要包含反引号或其他文本。
    {
      "queries": [
        {
          "query": "一个搜索引擎查询", 
          "researchGoal": "首先谈谈此查询旨在达成的研究目标，然后深入探讨在找到结果后如何推进研究，提及额外的研究方向。尽可能具体，尤其是对于额外的研究方向。",
        },
      ]
    }`,
    // prompt: `Given the following prompt from the user, generate a list of SERP queries to research the topic. Return a maximum of ${numQueries} queries, but feel free to return less if the original prompt is clear. Make sure each query is unique and not similar to each other: <prompt>${query}</prompt>\n\n${
    //   learnings
    //     ? `Here are some learnings from previous research, use them to generate more specific queries: ${learnings.join(
    //         '\n',
    //       )}`
    //     : ''
    // }
    // Example JSON are shown below. Output just the JSON with no backticks or other text.
    // {
    //   "queries": [
    //     {
    //       "query": "A SERP query", 
    //       "researchGoal": "First talk about the goal of the research that this query is meant to accomplish, then go deeper into how to advance the research once the results are found, mention additional research directions. Be as specific as possible, especially for additional research directions.",
    //     },
    //   ]
    // }`,
  });

  try {
    var obj = res.object as { queries: { query: string, researchGoal: string }[] };
    console.log("Generated SERP queries: ", obj.queries);
    return obj.queries.slice(0, numQueries);
  }catch(e) {
    console.error('Error generating SERP queries: ', e);
    return [];
  }
}

type ProcessSerpResult = {
  learnings: string[];
  followUpQuestions: string[];
};

async function processSerpResult({
  query,
  result,
  numLearnings = 3,
  numFollowUpQuestions = 3,
}: {
  query: string;
  result: SearchResponse;
  numLearnings?: number;
  numFollowUpQuestions?: number;
}): Promise<ProcessSerpResult> {
  const contents = compact(result.data.map(item => item.markdown)).map(
    content => trimPrompt(content, 25_000),
  );
  console.log(`Ran ${query}, found ${contents.length} contents`);
  var prompt = `根据对查询<query>${query}</query>的搜索结果，生成最多${numLearnings}条认知（learning）。
确保每条认知都是独特的，且彼此之间不相似。认知应简洁明了，尽可能详细且信息丰富。确保在学习内容中包含任何实体，
如人物、地点、公司、产品、事物等，以及任何确切的度量、数字或日期。这些学习内容将用于进一步研究该主题。
同时生成最多 ${numFollowUpQuestions} 个后续问题。
示例 JSON 如下所示。仅输出 JSON，不要包含反引号或其他文本。
{
  "learnings": ["从内容中获得的认知"],
  "followUpQuestions": ["一个后续问题"],
}
<contents>${contents
      .map(content => `<content>\n${content}\n</content>`)
      .join('\n')}</contents>`;
//   var prompt = `Given the following contents from a SERP search for the query <query>${query}</query>, generate a 
// list of learnings (max of ${numLearnings}) from the contents. Return a maximum of ${numLearnings} learnings, 
// but feel free to return less if the contents are clear. Make sure each learning is unique and not similar 
// to each other. The learnings should be concise and to the point, as detailed and infromation dense as 
// possible. Make sure to include any entities like people, places, companies, products, things, etc in the 
// learnings, as well as any exact metrics, numbers, or dates. The learnings will be used to research the topic 
// further. Also generate up to ${numFollowUpQuestions} follow-up questions. 
// Example JSON are shown below. Output just the JSON with no backticks or other text.
// {
//   "learnings": ["a learning from the content"],
//   "followUpQuestions": ["a follow up question"],
// }
// <contents>${contents
//       .map(content => `<content>\n${content}\n</content>`)
//       .join('\n')}</contents>`;


  console.log("Total prompt length: ", prompt.length);

  const res = await generateObject({
    model: model,
    output: 'no-schema',
    // abortSignal: AbortSignal.timeout(60_000),
    system: systemPrompt(),
    prompt: prompt,
  });

  try {
    const obj = res.object as ProcessSerpResult;
    console.log(
      `Created ${obj.learnings.length} learnings`,
      obj.learnings,
    );

    return {
      learnings: obj.learnings.slice(0, numLearnings),
      followUpQuestions: obj.followUpQuestions.slice(0, numFollowUpQuestions)
    };
  } catch (e) {
    console.error('Error processing SERP result: ', e);
    return {
      learnings: [],
      followUpQuestions: []
    }
  }
}

export async function writeFinalReport({
  prompt,
  learnings,
  visitedUrls,
}: {
  prompt: string;
  learnings: string[];
  visitedUrls: string[];
}) {
  const learningsString = trimPrompt(
    learnings
      .map(learning => `<learning>\n${learning}\n</learning>`)
      .join('\n'),
    150_000,
  );

  const res = await generateText({
    model: model,
    // output: 'no-schema',
    system: systemPrompt(),
    prompt: `根据用户提供的以下提示，就该主题撰写一份最终报告，运用研究所得的认知。尽可能详细，
目标是 3 页或更多，涵盖研究的所有成果。
    
    <prompt>${prompt}</prompt>
    
    以下是之前研究得到的所有认知：

    <learnings>
    ${learningsString}
    </learnings>.
    
    使用markdown格式.`,
    // prompt: `Given the following prompt from the user, write a final report on the topic 
    // using the learnings from research. Make it as as detailed as possible, aim for 3 or 
    // more pages, include ALL the learnings from research:
    
    // <prompt>${prompt}</prompt>
    
    // Here are all the learnings from previous research:

    // <learnings>
    // ${learningsString}
    // </learnings>.
    
    // Use markdown format.`,
  });

  // Append the visited URLs section to the report
  const urlsSection = `\n\n## Sources\n\n${visitedUrls.map(url => `- ${url}`).join('\n')}`;
  return res.text + urlsSection;
}

export async function deepResearch({
  query,
  breadth,
  depth,
  learnings = [],
  visitedUrls = [],
}: {
  query: string;
  breadth: number;
  depth: number;
  learnings?: string[];
  visitedUrls?: string[];
}): Promise<ResearchResult> {
  var serpQueries = await generateSerpQueries({
    query,
    learnings,
    numQueries: breadth,
  });
  if (serpQueries.length === 0) {
    console.log("Retrying...");
    serpQueries = await generateSerpQueries({
      query,
      learnings,
      numQueries: breadth,
    });
  }
  const limit = pLimit(ConcurrencyLimit);

  const results = await Promise.all(
    serpQueries.map(serpQuery =>
      limit(async () => {
        try {
          const result = await firecrawl.search(serpQuery.query, {
            timeout: 15000,
            limit: 5,
            scrapeOptions: { formats: ['markdown'] },
          });

          // Collect URLs from this search
          const newUrls = compact(result.data.map(item => item.url));
          const newBreadth = Math.ceil(breadth / 2);
          const newDepth = depth - 1;

          var newLearnings = await processSerpResult({
            query: serpQuery.query,
            result,
            numFollowUpQuestions: newBreadth,
          });
          if (newLearnings.learnings.length === 0) {
            console.log("Retrying...");
            newLearnings = await processSerpResult({
              query: serpQuery.query,
              result,
              numFollowUpQuestions: newBreadth,
            });
          }
          const allLearnings = [...learnings, ...newLearnings.learnings];
          const allUrls = [...visitedUrls, ...newUrls];

          if (newDepth > 0) {
            console.log(
              `Researching deeper, breadth: ${newBreadth}, depth: ${newDepth}`,
            );

            const nextQuery = `
            Previous research goal: ${serpQuery.researchGoal}
            Follow-up research directions: ${newLearnings.followUpQuestions.map(q => `\n${q}`).join('')}
          `.trim();

            return deepResearch({
              query: nextQuery,
              breadth: newBreadth,
              depth: newDepth,
              learnings: allLearnings,
              visitedUrls: allUrls,
            });
          } else {
            return {
              learnings: allLearnings,
              visitedUrls: allUrls,
            };
          }
        } catch (e) {
          console.error(`Error running query: ${serpQuery.query}: `, e);
          return {
            learnings: [],
            visitedUrls: [],
          };
        }
      }),
    ),
  );

  return {
    learnings: [...new Set(results.flatMap(r => r.learnings))],
    visitedUrls: [...new Set(results.flatMap(r => r.visitedUrls))],
  };
}

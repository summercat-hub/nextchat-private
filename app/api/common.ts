import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "../config/server";
import { OPENAI_BASE_URL, ServiceProvider } from "../constant";
import { cloudflareAIGatewayUrl } from "../utils/cloudflare";
import { prettyObject } from "../utils/format";
import { getModelProvider, isModelNotavailableInServer } from "../utils/model";

const serverConfig = getServerSideConfig();
const WEB_SEARCH_HEADER = "x-nextchat-web-search";

type OpenAIChatMessage = {
  role: "developer" | "system" | "user" | "assistant";
  content: string | Array<{ type?: string; text?: string }>;
};

type OpenAIChatBody = {
  model?: string;
  messages?: OpenAIChatMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
};

type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
};

type WebSearchDecision = {
  shouldSearch: boolean;
  reason: string;
  query?: string;
  source: "rule" | "router" | "fallback";
  category:
    | "explicit_no_search"
    | "explicit_search"
    | "url"
    | "current_external_fact"
    | "date_time_calculation"
    | "local_task"
    | "conversational"
    | "general_knowledge"
    | "uncertain";
};

const DIRECT_SEARCH_PATTERNS = [
  /\b(search|google|browse|web search|look up|source|citation|official site)\b/i,
  /(搜索|搜一下|搜搜|查一下|查查|查询|检索|全网|网上|联网|互联网|官网|链接|网址|出处|来源|引用|小红书|推特|Twitter|Reddit|YouTube|GitHub)/i,
];

const EXPLICIT_NO_SEARCH_PATTERNS = [
  /(不要搜索|不用搜索|别搜索|不要联网|不用联网|别联网|不用查|不要查)/i,
];

const CONVERSATIONAL_PATTERNS = [
  /^(你好|您好|嗨|hi|hello|hey|在吗|早上好|晚上好|谢谢|感谢)[。.!！?？\s]*$/i,
];

const CURRENT_OR_RELATIVE_TIME_PATTERNS = [
  /(最新|最近|现在|当前|目前|截止|今天|明天|后天|昨天|本周|下周|这个月|今年|实时|刚刚|新出|已经|还|是否|能不能)/i,
];

const VOLATILE_EXTERNAL_FACT_PATTERNS = [
  /(天气|气温|空气质量|台风|价格|费用|收费|计费|多少钱|汇率|股价|股票|基金|黄金|油价)/i,
  /(新闻|公告|发布|上线|上架|下架|可用|不可用|政策|法规|规则|排名|排行|榜单|赛程|比分|抽签|截止日期)/i,
  /(总统|首相|CEO|负责人|创始人|官网|营业|开门|关门|地址|电话)/i,
];

const DYNAMIC_SUBJECT_PATTERNS = [
  /(OpenAI|ChatGPT|Gemini|Claude|DeepSeek|DeepInfra|Tavily|Vercel|Codex|Grok|API|模型|model|公司|产品|官网|GitHub|小红书|推特|Twitter|Reddit|YouTube)/i,
];

const MODEL_OR_PRODUCT_RELEASE_PATTERNS = [
  /((OpenAI|ChatGPT|Gemini|Claude|DeepSeek|DeepInfra|Tavily|Vercel|Codex|Grok|模型|model|API).{0,20}(出到|更新到|最新|现在|当前|版本|发布|上线|支持哪些|有哪些|能用|可用|几代|哪一版)|(出到|更新到|最新|现在|当前|版本|发布|上线|支持哪些|有哪些|能用|可用|几代|哪一版).{0,20}(OpenAI|ChatGPT|Gemini|Claude|DeepSeek|DeepInfra|Tavily|Vercel|Codex|Grok|模型|model|API))/i,
];

const DATE_TIME_CALCULATION_PATTERNS = [
  /(今天|明天|后天|昨天|前天|本周|下周|上周|这个月|下个月|今年|明年).{0,16}(几月几号|几号|多少号|星期几|周几|哪天|日期)/i,
  /(几月几号|几号|多少号|星期几|周几|哪天|日期).{0,16}(今天|明天|后天|昨天|前天|本周|下周|上周|这个月|下个月|今年|明年)/i,
  /(现在|当前|此刻).{0,8}(几点|时间|日期)/i,
];

const LOCAL_TASK_PATTERNS = [
  /(翻译|改写|润色|总结|摘要|扩写|缩写|仿写|写一篇|写一个|生成|起草|帮我写|分析这段|阅读以下|根据下面|代码|函数|报错|数学|计算)/i,
];

function matchesAnyPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function looksLikeCurrentExternalFact(text: string) {
  if (matchesAnyPattern(text, MODEL_OR_PRODUCT_RELEASE_PATTERNS)) return true;
  if (matchesAnyPattern(text, VOLATILE_EXTERNAL_FACT_PATTERNS)) return true;
  return (
    matchesAnyPattern(text, CURRENT_OR_RELATIVE_TIME_PATTERNS) &&
    matchesAnyPattern(text, DYNAMIC_SUBJECT_PATTERNS)
  );
}

function decideWebSearchByRule(body: OpenAIChatBody): WebSearchDecision | null {
  const query = getLastUserQuery(body);
  const normalizedQuery = query.replace(/\s+/g, " ").trim();

  if (!normalizedQuery) {
    return {
      shouldSearch: false,
      reason: "empty user query",
      source: "rule",
      category: "local_task",
    };
  }

  if (matchesAnyPattern(normalizedQuery, EXPLICIT_NO_SEARCH_PATTERNS)) {
    return {
      shouldSearch: false,
      reason: "query explicitly says not to search",
      query: normalizedQuery,
      source: "rule",
      category: "explicit_no_search",
    };
  }

  if (matchesAnyPattern(normalizedQuery, CONVERSATIONAL_PATTERNS)) {
    return {
      shouldSearch: false,
      reason: "query is conversational",
      query: normalizedQuery,
      source: "rule",
      category: "conversational",
    };
  }

  if (matchesAnyPattern(normalizedQuery, DIRECT_SEARCH_PATTERNS)) {
    return {
      shouldSearch: true,
      reason: "query contains explicit search or source intent",
      query: normalizedQuery,
      source: "rule",
      category: "explicit_search",
    };
  }

  if (/https?:\/\/|www\./i.test(normalizedQuery)) {
    return {
      shouldSearch: true,
      reason: "query contains a web URL",
      query: normalizedQuery,
      source: "rule",
      category: "url",
    };
  }

  if (looksLikeCurrentExternalFact(normalizedQuery)) {
    return {
      shouldSearch: true,
      reason: "query asks for current or changeable external information",
      query: normalizedQuery,
      source: "rule",
      category: "current_external_fact",
    };
  }

  if (matchesAnyPattern(normalizedQuery, DATE_TIME_CALCULATION_PATTERNS)) {
    return {
      shouldSearch: false,
      reason: "query only needs runtime date/time calculation",
      query: normalizedQuery,
      source: "rule",
      category: "date_time_calculation",
    };
  }

  if (matchesAnyPattern(normalizedQuery, LOCAL_TASK_PATTERNS)) {
    return {
      shouldSearch: false,
      reason: "query can be handled locally without external information",
      query: normalizedQuery,
      source: "rule",
      category: "local_task",
    };
  }

  return null;
}

function getContentText(content: OpenAIChatMessage["content"]) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => (item.type === "text" ? item.text ?? "" : ""))
    .join("\n")
    .trim();
}

function getLastUserQuery(body: OpenAIChatBody) {
  const lastUserMessage = [...(body.messages ?? [])]
    .reverse()
    .find((message) => message.role === "user");

  return lastUserMessage ? getContentText(lastUserMessage.content).trim() : "";
}

function getRuntimeFacts() {
  const now = new Date();
  const timeZone = serverConfig.webSearchTimeZone || "Asia/Shanghai";

  try {
    return {
      isoTime: now.toISOString(),
      localizedTime: new Intl.DateTimeFormat("zh-CN", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZoneName: "short",
      }).format(now),
      timeZone,
    };
  } catch (e) {
    console.error("[Runtime Context] invalid time zone", timeZone, e);
    return {
      isoTime: now.toISOString(),
      localizedTime: now.toISOString(),
      timeZone: "UTC",
    };
  }
}

function injectRuntimeContext(body: OpenAIChatBody): OpenAIChatBody {
  const runtime = getRuntimeFacts();

  return {
    ...body,
    messages: [
      {
        role: "system",
        content:
          "Runtime context injected by the server for this turn.\n" +
          `Current server time: ${runtime.localizedTime}\n` +
          `Current server time ISO: ${runtime.isoTime}\n` +
          `Time zone: ${runtime.timeZone}\n` +
          "When the user mentions relative dates or times such as today, tomorrow, yesterday, this week, next week, recent, current, or now, interpret them using this runtime context instead of model training data. If the question only asks for date/time arithmetic, answer from this context without claiming web search is needed.",
      },
      ...(body.messages ?? []),
    ],
  };
}

function extractJsonObject(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : "";
}

async function decideWebSearchWithRouter(
  body: OpenAIChatBody,
): Promise<WebSearchDecision> {
  const query = getLastUserQuery(body).replace(/\s+/g, " ").trim();
  const model = serverConfig.webSearchRouterModel;
  const apiKey = serverConfig.webSearchRouterApiKey;

  if (!query) {
    return {
      shouldSearch: false,
      reason: "empty user query",
      source: "fallback",
      category: "local_task",
    };
  }

  if (!model || !apiKey) {
    return {
      shouldSearch: false,
      reason: "router model or API key is not configured",
      query,
      source: "fallback",
      category: "general_knowledge",
    };
  }

  const runtime = getRuntimeFacts();
  const baseUrl = (
    serverConfig.webSearchRouterBaseUrl || "https://api.deepinfra.com/v1/openai"
  ).replace(/\/+$/, "");

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content:
              'You are a web-search routing classifier. Decide whether answering the user\'s question requires current external information from the web. Do not answer the user\'s question. Return only valid compact JSON with this shape: {"needsSearch":boolean,"reason":"short reason","category":"current_external_fact|date_time_calculation|local_task|general_knowledge|uncertain","searchQuery":string|null}. Rules: if the question asks about latest/current/recent status of companies, products, models, APIs, prices, policies, weather, news, availability, rankings, versions, schedules, or public roles, needsSearch must be true. If the question only asks today\'s/tomorrow\'s/yesterday\'s date, weekday, or date arithmetic, needsSearch must be false. If unsure, needsSearch must be true and category must be uncertain.',
          },
          {
            role: "user",
            content: JSON.stringify({
              currentServerTime: runtime.localizedTime,
              currentServerIsoTime: runtime.isoTime,
              timeZone: runtime.timeZone,
              userQuestion: query,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `router failed: ${response.status} ${await response.text()}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(extractJsonObject(content)) as {
      needsSearch?: boolean;
      reason?: string;
      category?: WebSearchDecision["category"];
      searchQuery?: string | null;
    };
    const category = parsed.category || "uncertain";
    const shouldSearch =
      parsed.needsSearch === true || category === "uncertain";
    const searchQuery =
      typeof parsed.searchQuery === "string" && parsed.searchQuery.trim()
        ? parsed.searchQuery.trim()
        : query;

    return {
      shouldSearch,
      reason: parsed.reason || "router classified the query",
      query: searchQuery,
      source: "router",
      category,
    };
  } catch (e) {
    console.error("[Web Search Router]", e);
    return {
      shouldSearch: true,
      reason: "router failed; falling back to search for uncertain query",
      query,
      source: "fallback",
      category: "uncertain",
    };
  }
}

async function decideWebSearch(
  body: OpenAIChatBody,
): Promise<WebSearchDecision> {
  const ruleDecision = decideWebSearchByRule(body);
  if (ruleDecision) return ruleDecision;

  return decideWebSearchWithRouter(body);
}

function formatSearchContext(results: TavilySearchResult[]) {
  if (results.length === 0) {
    return "Tavily search returned no useful results for this query.";
  }

  return results
    .map((result, index) => {
      const title = result.title || "Untitled";
      const url = result.url || "";
      const content = result.content || "";
      return `[${index + 1}] ${title}\nURL: ${url}\nSnippet: ${content}`;
    })
    .join("\n\n");
}

async function injectTavilySearchContext(
  body: OpenAIChatBody,
  apiKey: string,
  searchQuery?: string,
) {
  const query = (searchQuery || getLastUserQuery(body)).trim();
  if (!query) return body;

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tavily search failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { results?: TavilySearchResult[] };
  const searchContext = formatSearchContext((data.results ?? []).slice(0, 5));

  body.messages = [
    {
      role: "system",
      content:
        "Web search has already been completed by the server for this turn. Do not say that you are searching, browsing, waiting for search results, or using live tools now. Use the following Tavily search results as external context when they are relevant. Prefer the search results for current facts, prices, dates, availability, news, and time-sensitive claims. Answer directly in the user's language. Do not output hidden reasoning, chain-of-thought, or <think> tags. Do not include a reference/source section, source URLs, citations, or raw links unless the user explicitly asks for sources. If the results are insufficient, say so clearly.\n\n" +
        searchContext,
    },
    ...(body.messages ?? []),
  ];

  if (typeof body.max_completion_tokens !== "number") {
    body.max_tokens = Math.max(body.max_tokens ?? 0, 4096);
  }

  return body;
}

export async function requestOpenai(req: NextRequest) {
  const controller = new AbortController();

  const isAzure = req.nextUrl.pathname.includes("azure/deployments");

  var authValue,
    authHeaderName = "";
  if (isAzure) {
    authValue =
      req.headers
        .get("Authorization")
        ?.trim()
        .replaceAll("Bearer ", "")
        .trim() ?? "";

    authHeaderName = "api-key";
  } else {
    authValue = req.headers.get("Authorization") ?? "";
    authHeaderName = "Authorization";
  }

  let path = `${req.nextUrl.pathname}`.replaceAll("/api/openai/", "");

  let baseUrl =
    (isAzure ? serverConfig.azureUrl : serverConfig.baseUrl) || OPENAI_BASE_URL;

  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }

  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  console.log("[Proxy] ", path);
  console.log("[Base Url]", baseUrl);

  const timeoutId = setTimeout(
    () => {
      controller.abort();
    },
    10 * 60 * 1000,
  );

  if (isAzure) {
    const azureApiVersion =
      req?.nextUrl?.searchParams?.get("api-version") ||
      serverConfig.azureApiVersion;
    baseUrl = baseUrl.split("/deployments").shift() as string;
    path = `${req.nextUrl.pathname.replaceAll(
      "/api/azure/",
      "",
    )}?api-version=${azureApiVersion}`;

    // Forward compatibility:
    // if display_name(deployment_name) not set, and '{deploy-id}' in AZURE_URL
    // then using default '{deploy-id}'
    if (serverConfig.customModels && serverConfig.azureUrl) {
      const modelName = path.split("/")[1];
      let realDeployName = "";
      serverConfig.customModels
        .split(",")
        .filter((v) => !!v && !v.startsWith("-") && v.includes(modelName))
        .forEach((m) => {
          const [fullName, displayName] = m.split("=");
          const [_, providerName] = getModelProvider(fullName);
          if (providerName === "azure" && !displayName) {
            const [_, deployId] = (serverConfig?.azureUrl ?? "").split(
              "deployments/",
            );
            if (deployId) {
              realDeployName = deployId;
            }
          }
        });
      if (realDeployName) {
        console.log("[Replace with DeployId", realDeployName);
        path = path.replaceAll(modelName, realDeployName);
      }
    }
  }

  const fetchUrl = cloudflareAIGatewayUrl(`${baseUrl}/${path}`);
  console.log("fetchUrl", fetchUrl);

  let requestBodyText: string | undefined;
  if (req.body) {
    requestBodyText = await req.text();
  }

  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      [authHeaderName]: authValue,
      ...(serverConfig.openaiOrgId && {
        "OpenAI-Organization": serverConfig.openaiOrgId,
      }),
    },
    method: req.method,
    body: requestBodyText,
    // to fix #2485: https://stackoverflow.com/questions/55920957/cloudflare-worker-typeerror-one-time-use-body
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  const isChatCompletionRequest =
    req.method === "POST" && path.endsWith("chat/completions");
  const shouldUseWebSearch =
    req.headers.get(WEB_SEARCH_HEADER) === "1" && isChatCompletionRequest;

  if (isChatCompletionRequest && requestBodyText) {
    try {
      let jsonBody = injectRuntimeContext(
        JSON.parse(requestBodyText) as OpenAIChatBody,
      );

      if (shouldUseWebSearch) {
        const searchDecision = await decideWebSearch(jsonBody);
        console.log("[Web Search Decision]", searchDecision);

        if (searchDecision.shouldSearch) {
          if (!serverConfig.tavilyApiKey) {
            return NextResponse.json(
              {
                error: true,
                message: "TAVILY_API_KEY is not configured.",
              },
              { status: 400 },
            );
          }

          jsonBody = await injectTavilySearchContext(
            jsonBody,
            serverConfig.tavilyApiKey,
            searchDecision.query,
          );
        }
      }

      requestBodyText = JSON.stringify(jsonBody);
      fetchOptions.body = requestBodyText;
    } catch (e) {
      console.error("[Chat Request Preparation]", e);
      return NextResponse.json(
        {
          error: true,
          message: prettyObject(e),
        },
        { status: 500 },
      );
    }
  }

  // #1815 try to refuse gpt4 request
  if (serverConfig.customModels && requestBodyText) {
    try {
      const jsonBody = JSON.parse(requestBodyText) as { model?: string };

      // not undefined and is false
      if (
        isModelNotavailableInServer(
          serverConfig.customModels,
          jsonBody?.model as string,
          [
            ServiceProvider.OpenAI,
            ServiceProvider.Azure,
            jsonBody?.model as string, // support provider-unspecified model
          ],
        )
      ) {
        return NextResponse.json(
          {
            error: true,
            message: `you are not allowed to use ${jsonBody?.model} model`,
          },
          {
            status: 403,
          },
        );
      }
    } catch (e) {
      console.error("[OpenAI] gpt4 filter", e);
    }
  }

  try {
    const res = await fetch(fetchUrl, fetchOptions);

    // Extract the OpenAI-Organization header from the response
    const openaiOrganizationHeader = res.headers.get("OpenAI-Organization");

    // Check if serverConfig.openaiOrgId is defined and not an empty string
    if (serverConfig.openaiOrgId && serverConfig.openaiOrgId.trim() !== "") {
      // If openaiOrganizationHeader is present, log it; otherwise, log that the header is not present
      console.log("[Org ID]", openaiOrganizationHeader);
    } else {
      console.log("[Org ID] is not set up.");
    }

    // to prevent browser prompt for credentials
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");
    // to disable nginx buffering
    newHeaders.set("X-Accel-Buffering", "no");

    // Conditionally delete the OpenAI-Organization header from the response if [Org ID] is undefined or empty (not setup in ENV)
    // Also, this is to prevent the header from being sent to the client
    if (!serverConfig.openaiOrgId || serverConfig.openaiOrgId.trim() === "") {
      newHeaders.delete("OpenAI-Organization");
    }

    // The latest version of the OpenAI API forced the content-encoding to be "br" in json response
    // So if the streaming is disabled, we need to remove the content-encoding header
    // Because Vercel uses gzip to compress the response, if we don't remove the content-encoding header
    // The browser will try to decode the response with brotli and fail
    newHeaders.delete("content-encoding");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

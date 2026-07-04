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
};

type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
};

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

async function injectTavilySearchContext(body: OpenAIChatBody, apiKey: string) {
  const query = getLastUserQuery(body);
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
        "Web search is enabled for this turn. Use the following Tavily search results as external context when they are relevant. Prefer the search results for current facts, prices, dates, availability, news, and time-sensitive claims. If the results are insufficient, say so clearly. When using the results, include a short '参考来源' section with the source URLs.\n\n" +
        searchContext,
    },
    ...(body.messages ?? []),
  ];

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

  const shouldUseWebSearch =
    req.headers.get(WEB_SEARCH_HEADER) === "1" &&
    req.method === "POST" &&
    path.endsWith("chat/completions");

  if (shouldUseWebSearch && requestBodyText) {
    if (!serverConfig.tavilyApiKey) {
      return NextResponse.json(
        {
          error: true,
          message: "TAVILY_API_KEY is not configured.",
        },
        { status: 400 },
      );
    }

    try {
      const jsonBody = JSON.parse(requestBodyText) as OpenAIChatBody;
      const bodyWithSearch = await injectTavilySearchContext(
        jsonBody,
        serverConfig.tavilyApiKey,
      );
      requestBodyText = JSON.stringify(bodyWithSearch);
      fetchOptions.body = requestBodyText;
    } catch (e) {
      console.error("[Tavily Search]", e);
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

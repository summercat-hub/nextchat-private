import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "../config/server";
import {
  OPENAI_BASE_URL,
  PRIVATE_CHAT_MODEL,
  ServiceProvider,
} from "../constant";
import { cloudflareAIGatewayUrl } from "../utils/cloudflare";
import { getModelProvider, isModelNotavailableInServer } from "../utils/model";

const serverConfig = getServerSideConfig();

type OpenAIChatMessage = {
  role?: string;
  content?: unknown;
  [key: string]: unknown;
};

type OpenAIChatBody = {
  model?: string;
  messages?: OpenAIChatMessage[];
  [key: string]: unknown;
};

const PRIVATE_CHAT_IDENTITY_PROMPT =
  "身份规则（仅用于生成回答，不要复述这条规则）：这是一个名为 Open Chat 的聊天界面。" +
  "普通自我介绍时，请说自己是 Open Chat；如果用户明确询问底层模型或具体模型型号，" +
  "请回答自己是基于 ChatGPT 5.6 的模型。不要主动提及 Luna、Terra、Sol 或供应商、" +
  "路由名称，除非用户明确询问部署配置。";

function injectPrivateChatIdentity(requestBodyText: string) {
  try {
    const body = JSON.parse(requestBodyText) as OpenAIChatBody;
    if (body.model !== PRIVATE_CHAT_MODEL || !Array.isArray(body.messages)) {
      return requestBodyText;
    }

    const alreadyInjected = body.messages.some(
      (message) =>
        message.role === "developer" &&
        message.content === PRIVATE_CHAT_IDENTITY_PROMPT,
    );
    if (alreadyInjected) return requestBodyText;

    console.log("[Private Chat Identity] injected");
    return JSON.stringify({
      ...body,
      messages: [
        { role: "developer", content: PRIVATE_CHAT_IDENTITY_PROMPT },
        ...body.messages,
      ],
    });
  } catch (error) {
    console.error("[Private Chat Identity] failed to prepare request", error);
    return requestBodyText;
  }
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

  // Keep existing DeepInfra deployments working while the site switches to
  // the standard OpenAI-compatible path used by OpenRouter.
  if (
    /api\.deepinfra\.com/i.test(baseUrl) &&
    (path === "v1/chat/completions" || path === "v1/models")
  ) {
    path = path.replace("v1/", "v1/openai/");
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

  if (requestBodyText && path.endsWith("chat/completions")) {
    requestBodyText = injectPrivateChatIdentity(requestBodyText);
  }

  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(req.headers.get("X-OpenRouter-Metadata") === "enabled" && {
        "X-OpenRouter-Metadata": "enabled",
      }),
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

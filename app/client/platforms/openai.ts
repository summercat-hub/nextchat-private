"use client";
// azure and openai, using same models. so using same LLMApi.
import {
  ApiPath,
  OPENAI_BASE_URL,
  DEFAULT_MODELS,
  OpenaiPath,
  PRIVATE_CHAT_MODEL,
  Azure,
  REQUEST_TIMEOUT_MS,
  ServiceProvider,
} from "@/app/constant";
import {
  ChatMessageTool,
  useAccessStore,
  useAppConfig,
  useChatStore,
  usePluginStore,
} from "@/app/store";
import { collectModelsWithDefaultModel } from "@/app/utils/model";
import {
  preProcessImageContent,
  uploadImage,
  base64Image2Blob,
  streamWithThink,
} from "@/app/utils/chat";
import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";
import { ModelSize, DalleQuality, DalleStyle } from "@/app/typing";

import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  LLMUsage,
  MultimodalContent,
  SpeechOptions,
} from "../api";
import Locale from "../../locales";
import { getClientConfig } from "@/app/config/client";
import {
  getMessageTextContent,
  isVisionModel,
  isDalle3 as _isDalle3,
  getTimeoutMSByModel,
} from "@/app/utils";
import { fetch } from "@/app/utils/stream";

export interface OpenAIListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

export interface RequestPayload {
  messages: {
    role: "developer" | "system" | "user" | "assistant";
    content: string | MultimodalContent[];
  }[];
  stream?: boolean;
  model: string;
  temperature?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning?: {
    enabled: boolean;
    effort?: "low" | "medium" | "high" | "xhigh";
  };
  tools?: Array<{
    type: string;
    parameters?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  service_tier?: "default" | "priority" | "flex";
  stream_options?: {
    include_usage: boolean;
    continuous_usage_stats: boolean;
  };
}

export interface DalleRequestPayload {
  model: string;
  prompt: string;
  response_format: "url" | "b64_json";
  n: number;
  size: ModelSize;
  quality: DalleQuality;
  style: DalleStyle;
}

export class ChatGPTApi implements LLMApi {
  private disableListModels = true;

  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    const isAzure = path.includes("deployments");
    if (accessStore.useCustomConfig) {
      if (isAzure && !accessStore.isValidAzure()) {
        throw Error(
          "incomplete azure config, please check it in your settings page",
        );
      }

      baseUrl = isAzure ? accessStore.azureUrl : accessStore.openaiUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      const apiPath = isAzure ? ApiPath.Azure : ApiPath.OpenAI;
      baseUrl = isApp ? OPENAI_BASE_URL : apiPath;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (
      !baseUrl.startsWith("http") &&
      !isAzure &&
      !baseUrl.startsWith(ApiPath.OpenAI)
    ) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    // try rebuild url, when using cloudflare ai gateway in client
    return cloudflareAIGatewayUrl([baseUrl, path].join("/"));
  }

  async extractMessage(res: any) {
    if (res.error) {
      return "```\n" + JSON.stringify(res, null, 4) + "\n```";
    }
    // dalle3 model return url, using url create image message
    if (res.data) {
      let url = res.data?.at(0)?.url ?? "";
      const b64_json = res.data?.at(0)?.b64_json ?? "";
      if (!url && b64_json) {
        // uploadImage
        url = await uploadImage(base64Image2Blob(b64_json, "image/png"));
      }
      return [
        {
          type: "image_url",
          image_url: {
            url,
          },
        },
      ];
    }
    return res.choices?.at(0)?.message?.content ?? res;
  }

  async speech(options: SpeechOptions): Promise<ArrayBuffer> {
    const requestPayload = {
      model: options.model,
      input: options.input,
      voice: options.voice,
      response_format: options.response_format,
      speed: options.speed,
    };

    console.log("[Request] openai speech payload: ", requestPayload);

    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const speechPath = this.path(OpenaiPath.SpeechPath);
      const speechPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const res = await fetch(speechPath, speechPayload);
      clearTimeout(requestTimeoutId);
      return await res.arrayBuffer();
    } catch (e) {
      console.log("[Request] failed to make a speech request", e);
      throw e;
    }
  }

  async chat(options: ChatOptions) {
    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...options.config,
      ...{
        model: options.config.model,
        providerName: options.config.providerName,
      },
    };

    let requestPayload: RequestPayload | DalleRequestPayload;

    const isDalle3 = _isDalle3(options.config.model);
    const isO1OrO3 =
      options.config.model.startsWith("o1") ||
      options.config.model.startsWith("o3") ||
      options.config.model.startsWith("o4-mini");
    const isGpt5 = /(^|\/)gpt-5(?:[.-]|$)/i.test(modelConfig.model);
    const isPrivateGpt56Luna = modelConfig.model === PRIVATE_CHAT_MODEL;
    const activeReasoningEffort =
      modelConfig.reasoning_effort === "none"
        ? undefined
        : modelConfig.reasoning_effort;
    const reasoningEnabled = isPrivateGpt56Luna && !!activeReasoningEffort;
    const requestedServiceTier = modelConfig.service_tier ?? "default";
    const nativeWebSearchTools =
      isPrivateGpt56Luna && !options.config.disableNativeWebSearch
      ? [
          {
            type: "openrouter:web_search",
            parameters: {
              engine: "native",
              max_total_results: 8,
            },
          },
        ]
      : [];
    if (isDalle3) {
      const prompt = getMessageTextContent(
        options.messages.slice(-1)?.pop() as any,
      );
      requestPayload = {
        model: options.config.model,
        prompt,
        // URLs are only valid for 60 minutes after the image has been generated.
        response_format: "b64_json", // using b64_json, and save image in CacheStorage
        n: 1,
        size: options.config?.size ?? "1024x1024",
        quality: options.config?.quality ?? "standard",
        style: options.config?.style ?? "vivid",
      };
    } else {
      const visionModel = isVisionModel(options.config.model);
      const messages: ChatOptions["messages"] = [];
      for (const v of options.messages) {
        const content = visionModel
          ? await preProcessImageContent(v.content)
          : getMessageTextContent(v);
        if (!(isO1OrO3 && v.role === "system"))
          messages.push({ role: v.role, content });
      }

      requestPayload = {
        messages,
        stream: options.config.stream,
        model: modelConfig.model,
        reasoning: isPrivateGpt56Luna
          ? {
              enabled: reasoningEnabled,
              effort: reasoningEnabled ? activeReasoningEffort : undefined,
            }
          : undefined,
        tools:
          nativeWebSearchTools.length > 0 ? nativeWebSearchTools : undefined,
        service_tier:
          isPrivateGpt56Luna && requestedServiceTier !== "default"
            ? requestedServiceTier
            : undefined,
        stream_options: options.config.stream
          ? { include_usage: true, continuous_usage_stats: false }
          : undefined,
      };

      // GPT-5.6 Luna does not advertise sampling controls through OpenRouter.
      // Keep these fields for other OpenAI-compatible models, but omit them
      // entirely from Luna requests instead of sending values that providers
      // may silently ignore.
      if (!isPrivateGpt56Luna) {
        requestPayload.temperature =
          !isO1OrO3 && !isGpt5 ? modelConfig.temperature : 1;
        requestPayload.presence_penalty = !isO1OrO3
          ? modelConfig.presence_penalty
          : 0;
        requestPayload.frequency_penalty = !isO1OrO3
          ? modelConfig.frequency_penalty
          : 0;
        requestPayload.top_p = !isO1OrO3 ? modelConfig.top_p : 1;
      }

      if (isGpt5) {
        // Remove max_tokens if present
        delete requestPayload.max_tokens;
        // Add max_completion_tokens (or max_completion_tokens if that's what you meant)
        requestPayload["max_completion_tokens"] = modelConfig.max_tokens;
      } else if (isO1OrO3) {
        // by default the o1/o3 models will not attempt to produce output that includes markdown formatting
        // manually add "Formatting re-enabled" developer message to encourage markdown inclusion in model responses
        // (https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/reasoning?tabs=python-secure#markdown-output)
        requestPayload["messages"].unshift({
          role: "developer",
          content: "Formatting re-enabled",
        });

        // o1/o3 uses max_completion_tokens to control the number of tokens (https://platform.openai.com/docs/guides/reasoning#controlling-costs)
        requestPayload["max_completion_tokens"] = modelConfig.max_tokens;
      }

      if (!isO1OrO3 && !isGpt5) {
        requestPayload["max_tokens"] = Math.min(
          Math.max(modelConfig.max_tokens, 1024),
          16384,
        );
      }
    }

    const requestStartedAt = Date.now();
    let streamOpenedAt: number | undefined;
    let firstSseEventAt: number | undefined;
    let firstTokenAt: number | undefined;
    let firstReasoningTokenAt: number | undefined;
    let firstVisibleTokenAt: number | undefined;
    let hiddenReasoningChars = 0;
    let visibleAnswerChars = 0;
    let responseUsage:
      | {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          prompt_tokens_details?: { cached_tokens?: number };
          completion_tokens_details?: { reasoning_tokens?: number };
          server_tool_use?: { web_search_requests?: number };
        }
      | undefined;
    let estimatedCost: number | undefined;
    let confirmedServiceTier: string | undefined;
    let responseModel: string | undefined;
    let generationId: string | undefined;
    let routerMetadata:
      | {
          requested?: string;
          strategy?: string;
          summary?: string;
          attempts?: Array<{
            provider?: string;
            model?: string;
            status?: number;
          }>;
          pipeline?: Array<{ type?: string; name?: string }>;
        }
      | undefined;

    const elapsedMs = (timestamp?: number) =>
      timestamp == null ? undefined : timestamp - requestStartedAt;
    const logTimingMilestone = (
      milestone: string,
      timestamp: number,
      details: Record<string, unknown> = {},
    ) => {
      console.info("[Model Timing]", {
        milestone,
        elapsedMs: elapsedMs(timestamp),
        model: modelConfig.model,
        reasoning: activeReasoningEffort ?? "none",
        requestedServiceTier,
        ...details,
      });
    };

    const logRequestMetrics = (finishedAt = Date.now()) => {
      console.info("[Model Metrics]", {
        model: modelConfig.model,
        reasoning: activeReasoningEffort ?? "none",
        requestedServiceTier,
        confirmedServiceTier,
        effectiveServiceTier: confirmedServiceTier ?? requestedServiceTier,
        messageCount:
          "messages" in requestPayload ? requestPayload.messages.length : 1,
        temperature:
          "temperature" in requestPayload
            ? requestPayload.temperature
            : undefined,
        topP: "top_p" in requestPayload ? requestPayload.top_p : undefined,
        maxTokens:
          "max_completion_tokens" in requestPayload
            ? requestPayload.max_completion_tokens
            : "max_tokens" in requestPayload
            ? requestPayload.max_tokens
            : undefined,
        timeToStreamOpenMs: elapsedMs(streamOpenedAt),
        timeToFirstSseEventMs: elapsedMs(firstSseEventAt),
        timeToFirstTokenMs: elapsedMs(firstTokenAt),
        timeToFirstReasoningTokenMs: elapsedMs(firstReasoningTokenAt),
        timeToVisibleAnswerMs: elapsedMs(firstVisibleTokenAt),
        hiddenReasoningChars,
        visibleAnswerChars,
        totalDurationMs: finishedAt - requestStartedAt,
        promptTokens: responseUsage?.prompt_tokens,
        completionTokens: responseUsage?.completion_tokens,
        reasoningTokens:
          responseUsage?.completion_tokens_details?.reasoning_tokens,
        totalTokens: responseUsage?.total_tokens,
        cachedPromptTokens: responseUsage?.prompt_tokens_details?.cached_tokens,
        responseModel,
        generationId,
        openrouterRequestedModel: routerMetadata?.requested,
        openrouterRoutingStrategy: routerMetadata?.strategy,
        openrouterRoutingSummary: routerMetadata?.summary,
        openrouterAttempts: routerMetadata?.attempts,
        openrouterPipeline: routerMetadata?.pipeline,
        webSearchRequests:
          responseUsage?.server_tool_use?.web_search_requests,
        estimatedCost,
      });
    };

    console.info("[Model Request]", {
      model: modelConfig.model,
      reasoning: activeReasoningEffort ?? "none",
      serviceTier: requestedServiceTier,
      messageCount:
        "messages" in requestPayload ? requestPayload.messages.length : 1,
      temperature:
        "temperature" in requestPayload
          ? requestPayload.temperature
          : undefined,
      topP: "top_p" in requestPayload ? requestPayload.top_p : undefined,
      maxTokens:
        "max_completion_tokens" in requestPayload
          ? requestPayload.max_completion_tokens
          : "max_tokens" in requestPayload
          ? requestPayload.max_tokens
          : undefined,
      stream: "stream" in requestPayload ? requestPayload.stream : false,
    });

    const shouldStream = !isDalle3 && !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);
    const requestHeaders = {
      ...getHeaders(),
      ...(isPrivateGpt56Luna && {
        "X-OpenRouter-Metadata": "enabled",
      }),
    };

    try {
      let chatPath = "";
      if (modelConfig.providerName === ServiceProvider.Azure) {
        // find model, and get displayName as deployName
        const { models: configModels, customModels: configCustomModels } =
          useAppConfig.getState();
        const {
          defaultModel,
          customModels: accessCustomModels,
          useCustomConfig,
        } = useAccessStore.getState();
        const models = collectModelsWithDefaultModel(
          configModels,
          [configCustomModels, accessCustomModels].join(","),
          defaultModel,
        );
        const model = models.find(
          (model) =>
            model.name === modelConfig.model &&
            model?.provider?.providerName === ServiceProvider.Azure,
        );
        chatPath = this.path(
          (isDalle3 ? Azure.ImagePath : Azure.ChatPath)(
            (model?.displayName ?? model?.name) as string,
            useCustomConfig ? useAccessStore.getState().azureApiVersion : "",
          ),
        );
      } else {
        chatPath = this.path(
          isDalle3 ? OpenaiPath.ImagePath : OpenaiPath.ChatPath,
        );
      }
      if (shouldStream) {
        let index = -1;
        const [pluginTools, funcs] = usePluginStore
          .getState()
          .getAsTools(
            useChatStore.getState().currentSession().mask?.plugin || [],
          );
        const requestTools = [
          ...nativeWebSearchTools,
          ...(Array.isArray(pluginTools) ? pluginTools : []),
        ];
        // console.log("getAsTools", pluginTools, funcs);
        streamWithThink(
          chatPath,
          requestPayload,
          requestHeaders,
          requestTools as any,
          funcs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
            // console.log("parseSSE", text, runTools);
            const json = JSON.parse(text);
            responseModel = json.model ?? responseModel;
            routerMetadata = json.openrouter_metadata ?? routerMetadata;
            responseUsage = json.usage ?? responseUsage;
            estimatedCost =
              json.estimated_cost ??
              json.usage?.estimated_cost ??
              estimatedCost;
            const incomingServiceTier = json.service_tier as string | undefined;
            if (incomingServiceTier && !confirmedServiceTier) {
              confirmedServiceTier = incomingServiceTier;
              logTimingMilestone("service_tier_confirmed", Date.now(), {
                confirmedServiceTier,
              });
            } else {
              confirmedServiceTier =
                incomingServiceTier ?? confirmedServiceTier;
            }

            const choices = json.choices as Array<{
              delta: {
                content: string;
                tool_calls: ChatMessageTool[];
                reasoning_content: string | null;
                reasoning?: string | null;
              };
            }>;

            if (!choices?.length) return { isThinking: false, content: "" };

            const tool_calls = choices[0]?.delta?.tool_calls;
            if (tool_calls?.length > 0) {
              const id = tool_calls[0]?.id;
              const args = tool_calls[0]?.function?.arguments;
              if (id) {
                index += 1;
                runTools.push({
                  id,
                  type: tool_calls[0]?.type,
                  function: {
                    name: tool_calls[0]?.function?.name as string,
                    arguments: args,
                  },
                });
              } else {
                // @ts-ignore
                runTools[index]["function"]["arguments"] += args;
              }
            }

            const reasoning =
              choices[0]?.delta?.reasoning_content ??
              choices[0]?.delta?.reasoning;
            const content = choices[0]?.delta?.content;

            // Skip if both content and reasoning_content are empty or null
            if (
              (!reasoning || reasoning.length === 0) &&
              (!content || content.length === 0)
            ) {
              return {
                isThinking: false,
                content: "",
              };
            }

            if (reasoning && reasoning.length > 0) {
              return {
                isThinking: true,
                content: reasoning,
              };
            } else if (content && content.length > 0) {
              return {
                isThinking: false,
                content: content,
              };
            }

            return {
              isThinking: false,
              content: "",
            };
          },
          // processToolMessage, include tool_calls message and tool call results
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            // reset index value
            index = -1;
            // @ts-ignore
            requestPayload?.messages?.splice(
              // @ts-ignore
              requestPayload?.messages?.length,
              0,
              toolCallMessage,
              ...toolCallResult,
            );
          },
          {
            ...options,
            onStreamOpen(response: Response) {
              if (streamOpenedAt) return;
              streamOpenedAt = Date.now();
              generationId =
                response.headers.get("x-generation-id") ?? undefined;
              logTimingMilestone("stream_open", streamOpenedAt, {
                status: response.status,
                contentType: response.headers.get("content-type"),
              });
            },
            onSseEvent() {
              if (firstSseEventAt) return;
              firstSseEventAt = Date.now();
              logTimingMilestone("first_sse_event", firstSseEventAt);
            },
            onReasoningChunk(length: number) {
              hiddenReasoningChars += length;
              if (firstReasoningTokenAt) return;
              firstReasoningTokenAt = Date.now();
              firstTokenAt = firstTokenAt ?? firstReasoningTokenAt;
              logTimingMilestone(
                "first_reasoning_token",
                firstReasoningTokenAt,
              );
            },
            onVisibleChunk(length: number) {
              visibleAnswerChars += length;
              if (firstVisibleTokenAt) return;
              firstVisibleTokenAt = Date.now();
              firstTokenAt = firstTokenAt ?? firstVisibleTokenAt;
              logTimingMilestone("first_visible_answer", firstVisibleTokenAt, {
                hiddenReasoningCharsBeforeAnswer: hiddenReasoningChars,
              });
            },
            onFinish(message: string, responseRes: Response) {
              const finishedAt = Date.now();
              logTimingMilestone("completed", finishedAt, {
                hiddenReasoningChars,
                visibleAnswerChars,
              });
              logRequestMetrics(finishedAt);
              options.onFinish(message, responseRes);
            },
          },
        );
      } else {
        const chatPayload = {
          method: "POST",
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
          headers: requestHeaders,
        };

        // make a fetch request
        const requestTimeoutId = setTimeout(
          () => controller.abort(),
          getTimeoutMSByModel(options.config.model),
        );

        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        responseModel = resJson.model ?? responseModel;
        routerMetadata = resJson.openrouter_metadata ?? routerMetadata;
        generationId = res.headers.get("x-generation-id") ?? undefined;
        responseUsage = resJson.usage ?? responseUsage;
        estimatedCost =
          resJson.estimated_cost ??
          resJson.usage?.estimated_cost ??
          estimatedCost;
        confirmedServiceTier = resJson.service_tier ?? confirmedServiceTier;
        firstTokenAt = firstTokenAt ?? Date.now();
        firstVisibleTokenAt = firstVisibleTokenAt ?? firstTokenAt;
        const message = await this.extractMessage(resJson);
        logRequestMetrics();
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }
  async usage() {
    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
        .getDate()
        .toString()
        .padStart(2, "0")}`;
    const ONE_DAY = 1 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = formatDate(startOfMonth);
    const endDate = formatDate(new Date(Date.now() + ONE_DAY));

    const [used, subs] = await Promise.all([
      fetch(
        this.path(
          `${OpenaiPath.UsagePath}?start_date=${startDate}&end_date=${endDate}`,
        ),
        {
          method: "GET",
          headers: getHeaders(),
        },
      ),
      fetch(this.path(OpenaiPath.SubsPath), {
        method: "GET",
        headers: getHeaders(),
      }),
    ]);

    if (used.status === 401) {
      throw new Error(Locale.Error.Unauthorized);
    }

    if (!used.ok || !subs.ok) {
      throw new Error("Failed to query usage from openai");
    }

    const response = (await used.json()) as {
      total_usage?: number;
      error?: {
        type: string;
        message: string;
      };
    };

    const total = (await subs.json()) as {
      hard_limit_usd?: number;
    };

    if (response.error && response.error.type) {
      throw Error(response.error.message);
    }

    if (response.total_usage) {
      response.total_usage = Math.round(response.total_usage) / 100;
    }

    if (total.hard_limit_usd) {
      total.hard_limit_usd = Math.round(total.hard_limit_usd * 100) / 100;
    }

    return {
      used: response.total_usage,
      total: total.hard_limit_usd,
    } as LLMUsage;
  }

  async models(): Promise<LLMModel[]> {
    if (this.disableListModels) {
      return DEFAULT_MODELS.slice();
    }

    const res = await fetch(this.path(OpenaiPath.ListModelPath), {
      method: "GET",
      headers: {
        ...getHeaders(),
      },
    });

    const resJson = (await res.json()) as OpenAIListModelResponse;
    const chatModels = resJson.data?.filter(
      (m) => m.id.startsWith("gpt-") || m.id.startsWith("chatgpt-"),
    );
    console.log("[Models]", chatModels);

    if (!chatModels) {
      return [];
    }

    //由于目前 OpenAI 的 disableListModels 默认为 true，所以当前实际不会运行到这场
    let seq = 1000; //同 Constant.ts 中的排序保持一致
    return chatModels.map((m) => ({
      name: m.id,
      available: true,
      sorted: seq++,
      provider: {
        id: "openai",
        providerName: "OpenAI",
        providerType: "openai",
        sorted: 1,
      },
    }));
  }
}
export { OpenaiPath };

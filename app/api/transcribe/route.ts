import { NextRequest, NextResponse } from "next/server";
import { ModelProvider } from "../../constant";
import { getServerSideConfig } from "../../config/server";
import { auth } from "../auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_DURATION_MS = 65_000;
const CLOUDFLARE_STT_MODEL = "@cf/openai/whisper-large-v3-turbo";

type CloudflareTranscriptionResponse = {
  success?: boolean;
  result?: {
    text?: string;
    transcription_info?: {
      text?: string;
    };
  };
  errors?: Array<{
    message?: string;
  }>;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: true, message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: NextRequest) {
  const authResult = auth(request, ModelProvider.GPT);
  if (authResult.error) {
    return errorResponse(authResult.msg ?? "无权使用语音转文字", 401);
  }

  const serverConfig = getServerSideConfig();
  const accountId = serverConfig.cloudflareAccountId?.trim();
  const apiToken = serverConfig.cloudflareApiToken?.trim();

  if (!accountId || !apiToken) {
    return errorResponse("服务器尚未配置 Cloudflare Workers AI 凭据", 503);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("audio/")) {
    return errorResponse("只支持音频录音", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_AUDIO_BYTES) {
    return errorResponse("录音文件过大，请缩短后重试", 413);
  }

  const declaredDuration = Number(
    request.headers.get("x-audio-duration-ms") ?? 0,
  );
  if (declaredDuration > MAX_AUDIO_DURATION_MS) {
    return errorResponse("单次录音最长为 60 秒", 413);
  }

  const audioBuffer = await request.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    return errorResponse("没有检测到有效录音", 400);
  }
  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    return errorResponse("录音文件过大，请缩短后重试", 413);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
      accountId,
    )}/ai/run/${CLOUDFLARE_STT_MODEL}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio: Buffer.from(audioBuffer).toString("base64"),
        task: "transcribe",
        language: "zh",
        vad_filter: true,
        initial_prompt:
          "这是一段简体中文语音输入，可能包含中英文混合，以及 ChatGPT、Cloudflare、Vercel、Gemini、NextChat、API、AI 等技术名词。请准确转写并保留自然标点。",
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const payload = (await response.json()) as CloudflareTranscriptionResponse;

    if (!response.ok || payload.success === false) {
      const providerMessage = payload.errors?.[0]?.message;
      console.error("[Transcription] Cloudflare request failed", {
        status: response.status,
        providerMessage,
      });
      return errorResponse("语音转文字暂时失败，请稍后重试", 502);
    }

    const text =
      payload.result?.text?.trim() ??
      payload.result?.transcription_info?.text?.trim() ??
      "";

    if (!text) {
      return errorResponse("没有识别到清晰的语音内容", 422);
    }

    return NextResponse.json(
      { text },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return errorResponse("语音转写超时，请重试", 504);
    }

    console.error("[Transcription] unexpected error", error);
    return errorResponse("语音转文字暂时失败，请稍后重试", 500);
  } finally {
    clearTimeout(timeout);
  }
}

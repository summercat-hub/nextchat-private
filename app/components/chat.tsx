import { useDebouncedCallback } from "use-debounce";
import React, {
  Fragment,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import BrainIcon from "../icons/brain.svg";
import RenameIcon from "../icons/rename.svg";
import EditIcon from "../icons/rename.svg";
import ExportIcon from "../icons/share.svg";
import ReturnIcon from "../icons/return.svg";
import CopyIcon from "../icons/copy.svg";
import SpeakIcon from "../icons/speak.svg";
import SpeakStopIcon from "../icons/speak-stop.svg";
import LoadingIcon from "../icons/three-dots.svg";
import LoadingButtonIcon from "../icons/loading.svg";
import MaxIcon from "../icons/max.svg";
import MinIcon from "../icons/min.svg";
import ResetIcon from "../icons/reload.svg";
import ReloadIcon from "../icons/reload.svg";
import DeleteIcon from "../icons/clear.svg";
import PinIcon from "../icons/pin.svg";
import ConfirmIcon from "../icons/confirm.svg";
import CloseIcon from "../icons/close.svg";
import CancelIcon from "../icons/cancel.svg";
import MenuIcon from "../icons/menu.svg";

import StopIcon from "../icons/pause.svg";
import {
  BOT_HELLO,
  ChatMessage,
  createMessage,
  DEFAULT_TOPIC,
  SubmitKey,
  Theme,
  useAccessStore,
  useAppConfig,
  useChatStore,
} from "../store";

import {
  autoGrowTextArea,
  copyToClipboard,
  getMessageImages,
  getMessageTextContent,
  isVisionModel,
  safeLocalStorage,
  useMobileScreen,
  selectOrCopy,
} from "../utils";

import { uploadImage as uploadImageRemote } from "@/app/utils/chat";

import dynamic from "next/dynamic";

import { ChatControllerPool } from "../client/controller";
import { Prompt, usePromptStore } from "../store/prompt";
import Locale from "../locales";

import { IconButton } from "./button";
import styles from "./chat.module.scss";

import {
  BodyPortal,
  List,
  ListItem,
  Modal,
  Popover,
  showConfirm,
  showPrompt,
  showToast,
} from "./ui-lib";
import { useNavigate } from "react-router-dom";
import {
  ACCESS_CODE_PREFIX,
  CHAT_PAGE_SIZE,
  DEFAULT_TTS_ENGINE,
  ModelProvider,
  Path,
  REQUEST_TIMEOUT_MS,
  ServiceProvider,
  UNFINISHED_INPUT,
} from "../constant";
import { ContextPrompts } from "./mask";
import { ModelConfigList } from "./model-config";
import { ChatCommandPrefix, useChatCommand, useCommand } from "../command";
import { prettyObject } from "../utils/format";
import { getClientConfig } from "../config/client";
import { useAllModels } from "../utils/hooks";
import { ClientApi, MultimodalContent } from "../client/api";
import { createTTSPlayer } from "../utils/audio";

import { isEmpty } from "lodash-es";
import clsx from "clsx";
import { useMobileRubberBandScroll } from "./mobile-rubber-band";
import { useMobileHorizontalRubberBandScroll } from "./mobile-horizontal-rubber-band";

const MAX_ATTACH_IMAGES = 10;
const localStorage = safeLocalStorage();

const ttsPlayer = createTTSPlayer();

const Markdown = dynamic(async () => (await import("./markdown")).Markdown, {
  loading: () => <LoadingIcon />,
});

const ExportMessageModal = dynamic(
  async () => (await import("./exporter")).ExportMessageModal,
  {
    ssr: false,
    loading: () => <LoadingIcon />,
  },
);

function MenuUploadIcon() {
  return (
    <svg
      className={styles["chat-input-menu-glyph"]}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4.5" y="5.2" width="15" height="13.6" rx="2.8" />
      <circle cx="9" cy="10" r="1.55" />
      <path d="M6.8 17.1 11.1 12.8 14.3 15.9 16.1 14.1 19 17.1" />
    </svg>
  );
}

function MenuThemeIcon(props: { theme: Theme }) {
  if (props.theme === Theme.Dark) {
    return (
      <svg
        className={styles["chat-input-menu-glyph"]}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M15.8 4.9a7.3 7.3 0 1 0 3.3 11.3 6.2 6.2 0 0 1-7.7-7.7 7.4 7.4 0 0 0 4.4-3.6Z" />
      </svg>
    );
  }

  if (props.theme === Theme.Light) {
    return (
      <svg
        className={styles["chat-input-menu-glyph"]}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="4.25" />
        <path d="M12 3.6v2.05M12 18.35v2.05M3.6 12h2.05M18.35 12h2.05M6.05 6.05l1.45 1.45M16.5 16.5l1.45 1.45M17.95 6.05 16.5 7.5M7.5 16.5l-1.45 1.45" />
      </svg>
    );
  }

  return (
    <svg
      className={styles["chat-input-menu-glyph"]}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5.4 14.7A7.2 7.2 0 0 1 17 6.5" />
      <path d="M17 6.5h-3.1M17 6.5v-3.1" />
      <path d="M18.6 9.3A7.2 7.2 0 0 1 7 17.5" />
      <path d="M7 17.5h3.1M7 17.5v3.1" />
      <path d="M9.2 14.5 12 8.7l2.8 5.8M10.2 12.6h3.6" />
    </svg>
  );
}

function MenuSettingsIcon() {
  return (
    <svg
      className={styles["chat-input-menu-glyph"]}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10.2 4.3h3.6l.55 2.05a6.2 6.2 0 0 1 1.35.78l2.04-.56 1.8 3.12-1.49 1.5a6.5 6.5 0 0 1 0 1.62l1.49 1.5-1.8 3.12-2.04-.56a6.2 6.2 0 0 1-1.35.78l-.55 2.05h-3.6l-.55-2.05a6.2 6.2 0 0 1-1.35-.78l-2.04.56-1.8-3.12 1.49-1.5a6.5 6.5 0 0 1 0-1.62l-1.49-1.5 1.8-3.12 2.04.56a6.2 6.2 0 0 1 1.35-.78l.55-2.05Z" />
      <circle cx="12" cy="12" r="2.65" />
    </svg>
  );
}

type VoiceInputState = "idle" | "starting" | "recording" | "transcribing";
type VoiceStopAction = "insert" | "send" | "cancel";

const MAX_VOICE_RECORDING_MS = 60_000;
const MAX_VOICE_AUDIO_BYTES = 4 * 1024 * 1024;

function MicrophoneIcon() {
  return (
    <svg
      className={styles["chat-input-microphone-icon"]}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="8.25" y="3.25" width="7.5" height="12" rx="3.75" />
      <path d="M5.75 11.5a6.25 6.25 0 0 0 12.5 0" />
      <path d="M12 17.75v3" />
      <path d="M8.75 20.75h6.5" />
    </svg>
  );
}

function VoiceWaveform(props: {
  analyser: AnalyserNode | null;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame = 0;
    let frequencyData = props.analyser
      ? new Uint8Array(props.analyser.frequencyBinCount)
      : new Uint8Array(64);
    const waveformColor = getComputedStyle(canvas).color;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(rect.width * pixelRatio));
      const height = Math.max(1, Math.floor(rect.height * pixelRatio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.clearRect(0, 0, width, height);
      context.strokeStyle = waveformColor;
      context.lineCap = "round";
      context.lineWidth = 2.2 * pixelRatio;

      if (
        props.active &&
        props.analyser &&
        frequencyData.length !== props.analyser.frequencyBinCount
      ) {
        frequencyData = new Uint8Array(props.analyser.frequencyBinCount);
      }
      if (props.active && props.analyser) {
        props.analyser.getByteFrequencyData(frequencyData);
      }

      const barGap = 6.2 * pixelRatio;
      const barCount = Math.max(18, Math.floor(width / barGap));
      const centerY = height / 2;
      const maxBarHeight = Math.max(6 * pixelRatio, height * 0.72);

      for (let index = 0; index < barCount; index += 1) {
        const dataIndex = Math.min(
          frequencyData.length - 1,
          Math.floor((index / Math.max(1, barCount - 1)) * 52),
        );
        const signal = props.active ? frequencyData[dataIndex] / 255 : 0.08;
        const shapedSignal = Math.pow(Math.max(0.04, signal), 0.72);
        const barHeight = Math.max(
          2.5 * pixelRatio,
          shapedSignal * maxBarHeight,
        );
        const x = (index + 0.5) * (width / barCount);

        context.beginPath();
        context.moveTo(x, centerY - barHeight / 2);
        context.lineTo(x, centerY + barHeight / 2);
        context.stroke();
      }

      animationFrame = window.requestAnimationFrame(draw);
    };

    draw();
    return () => window.cancelAnimationFrame(animationFrame);
  }, [props.active, props.analyser]);

  return (
    <canvas
      ref={canvasRef}
      className={styles["chat-input-waveform"]}
      aria-hidden="true"
    />
  );
}

function appendTranscript(draft: string, transcript: string) {
  const trimmedDraft = draft.trimEnd();
  const trimmedTranscript = transcript.trim();
  if (!trimmedDraft) return trimmedTranscript;
  if (!trimmedTranscript) return trimmedDraft;
  return `${trimmedDraft}\n${trimmedTranscript}`;
}

const RealtimeChat = dynamic(
  async () => (await import("@/app/components/realtime-chat")).RealtimeChat,
  {
    ssr: false,
    loading: () => <LoadingIcon />,
  },
);

export function SessionConfigModel(props: { onClose: () => void }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();

  const updateConfig = (
    updater: (config: typeof session.mask.modelConfig) => void,
  ) => {
    const modelConfig = { ...session.mask.modelConfig };
    updater(modelConfig);
    chatStore.updateTargetSession(session, (session) => {
      session.mask.modelConfig = modelConfig;
      session.mask.syncGlobalConfig = false;
    });
  };

  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Context.Edit}
        onClose={() => props.onClose()}
        actions={[
          <IconButton
            key="reset"
            icon={<ResetIcon />}
            bordered
            text={Locale.Chat.Config.Reset}
            onClick={async () => {
              if (await showConfirm(Locale.Memory.ResetConfirm)) {
                chatStore.updateTargetSession(
                  session,
                  (session) => (session.memoryPrompt = ""),
                );
              }
            }}
          />,
        ]}
      >
        <List>
          <ModelConfigList
            modelConfig={{ ...session.mask.modelConfig }}
            updateConfig={updateConfig}
          />
          {session.mask.modelConfig.sendMemory && (
            <ListItem
              className="copyable"
              title={`${Locale.Memory.Title} (${session.lastSummarizeIndex} of ${session.messages.length})`}
              subTitle={session.memoryPrompt || Locale.Memory.EmptyContent}
            ></ListItem>
          )}
        </List>
      </Modal>
    </div>
  );
}

function PromptToast(props: {
  showToast?: boolean;
  showModal?: boolean;
  setShowModal: (_: boolean) => void;
}) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const context = session.mask.context;

  return (
    <div className={styles["prompt-toast"]} key="prompt-toast">
      {props.showToast && context.length > 0 && (
        <div
          className={clsx(styles["prompt-toast-inner"], "clickable")}
          role="button"
          onClick={() => props.setShowModal(true)}
        >
          <BrainIcon />
          <span className={styles["prompt-toast-content"]}>
            {Locale.Context.Toast(context.length)}
          </span>
        </div>
      )}
      {props.showModal && (
        <BodyPortal>
          <SessionConfigModel onClose={() => props.setShowModal(false)} />
        </BodyPortal>
      )}
    </div>
  );
}

function useSubmitHandler() {
  const config = useAppConfig();
  const submitKey = config.submitKey;
  const isComposing = useRef(false);

  useEffect(() => {
    const onCompositionStart = () => {
      isComposing.current = true;
    };
    const onCompositionEnd = () => {
      isComposing.current = false;
    };

    window.addEventListener("compositionstart", onCompositionStart);
    window.addEventListener("compositionend", onCompositionEnd);

    return () => {
      window.removeEventListener("compositionstart", onCompositionStart);
      window.removeEventListener("compositionend", onCompositionEnd);
    };
  }, []);

  const shouldSubmit = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Fix Chinese input method "Enter" on Safari
    if (e.keyCode == 229) return false;
    if (e.key !== "Enter") return false;
    if (e.key === "Enter" && (e.nativeEvent.isComposing || isComposing.current))
      return false;
    return (
      (config.submitKey === SubmitKey.AltEnter && e.altKey) ||
      (config.submitKey === SubmitKey.CtrlEnter && e.ctrlKey) ||
      (config.submitKey === SubmitKey.ShiftEnter && e.shiftKey) ||
      (config.submitKey === SubmitKey.MetaEnter && e.metaKey) ||
      (config.submitKey === SubmitKey.Enter &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey)
    );
  };

  return {
    submitKey,
    shouldSubmit,
  };
}

export type RenderPrompt = Pick<Prompt, "title" | "content">;

export function PromptHints(props: {
  prompts: RenderPrompt[];
  onPromptSelect: (prompt: RenderPrompt) => void;
}) {
  const noPrompts = props.prompts.length === 0;
  const [selectIndex, setSelectIndex] = useState(0);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectIndex(0);
  }, [props.prompts.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (noPrompts || e.metaKey || e.altKey || e.ctrlKey) {
        return;
      }
      // arrow up / down to select prompt
      const changeIndex = (delta: number) => {
        e.stopPropagation();
        e.preventDefault();
        const nextIndex = Math.max(
          0,
          Math.min(props.prompts.length - 1, selectIndex + delta),
        );
        setSelectIndex(nextIndex);
        selectedRef.current?.scrollIntoView({
          block: "center",
        });
      };

      if (e.key === "ArrowUp") {
        changeIndex(1);
      } else if (e.key === "ArrowDown") {
        changeIndex(-1);
      } else if (e.key === "Enter") {
        const selectedPrompt = props.prompts.at(selectIndex);
        if (selectedPrompt) {
          props.onPromptSelect(selectedPrompt);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.prompts.length, selectIndex]);

  if (noPrompts) return null;
  return (
    <div className={styles["prompt-hints"]}>
      {props.prompts.map((prompt, i) => (
        <div
          ref={i === selectIndex ? selectedRef : null}
          className={clsx(styles["prompt-hint"], {
            [styles["prompt-hint-selected"]]: i === selectIndex,
          })}
          key={prompt.title + i.toString()}
          onClick={() => props.onPromptSelect(prompt)}
          onMouseEnter={() => setSelectIndex(i)}
        >
          <div className={styles["hint-title"]}>{prompt.title}</div>
          <div className={styles["hint-content"]}>{prompt.content}</div>
        </div>
      ))}
    </div>
  );
}

function ClearContextDivider() {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();

  return (
    <div
      className={styles["clear-context"]}
      onClick={() =>
        chatStore.updateTargetSession(
          session,
          (session) => (session.clearContextIndex = undefined),
        )
      }
    >
      <div className={styles["clear-context-tips"]}>{Locale.Context.Clear}</div>
      <div className={styles["clear-context-revert-btn"]}>
        {Locale.Context.Revert}
      </div>
    </div>
  );
}

export function ChatAction(props: {
  text: string;
  icon: JSX.Element;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={props.text}
      title={props.text}
      className={clsx(
        styles["chat-input-action"],
        props.active && styles["chat-input-action-active"],
      )}
      onClick={props.onClick}
    >
      <div className={styles["icon"]} aria-hidden="true">
        {props.icon}
      </div>
    </button>
  );
}

function useScrollToBottom(
  scrollRef: RefObject<HTMLDivElement>,
  detach: boolean = false,
  messages: ChatMessage[],
) {
  // for auto-scroll
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollDomToBottom = useCallback(() => {
    const dom = scrollRef.current;
    if (dom) {
      requestAnimationFrame(() => {
        setAutoScroll(true);
        dom.scrollTo(0, dom.scrollHeight);
      });
    }
  }, [scrollRef]);

  // auto scroll
  useEffect(() => {
    if (autoScroll && !detach) {
      scrollDomToBottom();
    }
  });

  // auto scroll when messages length changes
  const lastMessagesLength = useRef(messages.length);
  useEffect(() => {
    if (messages.length > lastMessagesLength.current && !detach) {
      scrollDomToBottom();
    }
    lastMessagesLength.current = messages.length;
  }, [messages.length, detach, scrollDomToBottom]);

  return {
    scrollRef,
    autoScroll,
    setAutoScroll,
    scrollDomToBottom,
  };
}

const LOW_INTELLIGENCE_MODEL = "google/gemma-4-26B-A4B-it";
const MEDIUM_INTELLIGENCE_MODEL = "google/gemma-4-31B-it";

const INTELLIGENCE_OPTIONS = [
  {
    id: "low",
    label: "低",
    model: LOW_INTELLIGENCE_MODEL,
  },
  {
    id: "medium",
    label: "中",
    model: MEDIUM_INTELLIGENCE_MODEL,
  },
  {
    id: "high",
    label: "高",
    disabled: true,
  },
] as const;

function IntelligenceSelector(props: { visible: boolean; disabled: boolean }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const selectorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const currentModel = session.mask.modelConfig.model;
  const currentLevel =
    currentModel === LOW_INTELLIGENCE_MODEL ? "low" : "medium";
  const currentLabel = currentLevel === "low" ? "低" : "中";

  useEffect(() => {
    if (!props.visible || props.disabled) setOpen(false);
  }, [props.disabled, props.visible]);

  useEffect(() => {
    if (!open) return;

    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (!selectorRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeWhenClickingOutside);
    return () =>
      document.removeEventListener("pointerdown", closeWhenClickingOutside);
  }, [open]);

  if (!props.visible) return null;

  return (
    <div className={styles["chat-intelligence-layer"]}>
      <div
        ref={selectorRef}
        className={clsx(
          styles["chat-intelligence-selector"],
          open && styles["chat-intelligence-selector-open"],
        )}
      >
        <button
          type="button"
          className={styles["chat-intelligence-trigger"]}
          aria-label={`智能程度：${currentLabel}`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={props.disabled}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setOpen((value) => !value)}
        >
          <span>{currentLabel}</span>
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="m4.75 6.25 3.25 3.25 3.25-3.25" />
          </svg>
        </button>

        {open && (
          <div className={styles["chat-intelligence-menu"]} role="menu">
            <div className={styles["chat-intelligence-title"]}>智能</div>
            {INTELLIGENCE_OPTIONS.map((option) => {
              const selected = option.id === currentLevel;
              const unavailable = "disabled" in option && option.disabled;

              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  aria-disabled={unavailable}
                  disabled={unavailable}
                  className={clsx(
                    styles["chat-intelligence-option"],
                    selected && styles["chat-intelligence-option-selected"],
                    unavailable && styles["chat-intelligence-option-disabled"],
                  )}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (unavailable || !("model" in option)) return;
                    chatStore.updateTargetSession(session, (targetSession) => {
                      targetSession.mask.modelConfig.model = option.model;
                      targetSession.mask.modelConfig.providerName =
                        ServiceProvider.OpenAI;
                    });
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {selected && !unavailable && (
                    <svg
                      className={styles["chat-intelligence-check"]}
                      viewBox="0 0 18 18"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="m3.75 9.25 3.25 3.25 7.25-7.25" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatActions(props: {
  uploadImage: () => void;
  setAttachImages: (images: string[]) => void;
  setUploading: (uploading: boolean) => void;
  showPromptModal: () => void;
  uploading: boolean;
  inputFocused: boolean;
  voiceActive: boolean;
  onCancelVoice: () => void;
}) {
  const {
    inputFocused,
    setAttachImages,
    setUploading,
    showPromptModal,
    uploadImage,
    uploading,
    voiceActive,
    onCancelVoice,
  } = props;
  const config = useAppConfig();
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const theme = config.theme;
  const currentModel = session.mask.modelConfig.model;
  const allModels = useAllModels();
  const models = useMemo(() => {
    const filteredModels = allModels.filter((m) => m.available);
    const defaultModel = filteredModels.find((m) => m.isDefault);

    if (defaultModel) {
      return [
        defaultModel,
        ...filteredModels.filter((m) => m !== defaultModel),
      ];
    }

    return filteredModels;
  }, [allModels]);
  const [showUploadImage, setShowUploadImage] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuState, setMenuState] = useState<
    "closed" | "opening" | "open" | "closing"
  >("closed");
  const menuMounted = menuState !== "closed";
  const menuExpanded = menuState === "open";

  const closeMenu = useCallback(() => {
    setMenuState((state) => {
      if (state === "closed" || state === "closing") return state;
      return "closing";
    });
  }, []);

  const openMenu = useCallback(() => {
    setMenuState((state) => (state === "closed" ? "opening" : state));
  }, []);

  useEffect(() => {
    if (menuState !== "opening") return;

    const frame = window.requestAnimationFrame(() => {
      setMenuState((state) => (state === "opening" ? "open" : state));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [menuState]);

  useEffect(() => {
    if (menuState !== "closing") return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timeout = window.setTimeout(
      () => setMenuState("closed"),
      reduceMotion ? 0 : 250,
    );

    return () => window.clearTimeout(timeout);
  }, [menuState]);

  useEffect(() => {
    if (!menuMounted || menuState === "closing") return;

    const closeFromOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu();
    };
    const closeFromViewportMovement = () => closeMenu();

    document.addEventListener("pointerdown", closeFromOutsidePointer, true);
    window.addEventListener("scroll", closeFromViewportMovement, true);
    window.addEventListener("wheel", closeFromViewportMovement, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchmove", closeFromViewportMovement, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener(
        "pointerdown",
        closeFromOutsidePointer,
        true,
      );
      window.removeEventListener("scroll", closeFromViewportMovement, true);
      window.removeEventListener("wheel", closeFromViewportMovement, true);
      window.removeEventListener("touchmove", closeFromViewportMovement, true);
    };
  }, [closeMenu, menuMounted, menuState]);

  useEffect(() => {
    if (voiceActive) setMenuState("closed");
  }, [voiceActive]);

  function nextTheme() {
    const themes = [Theme.Auto, Theme.Light, Theme.Dark];
    const themeIndex = themes.indexOf(theme);
    const nextIndex = (themeIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    config.update((config) => (config.theme = nextTheme));
  }

  useEffect(() => {
    const show =
      isVisionModel(currentModel) || /gemini-3\./i.test(currentModel);
    setShowUploadImage(show);
    if (!show) {
      setAttachImages([]);
      setUploading(false);
    }

    // if current model is not available
    // switch to first available model
    const isUnavailableModel = !models.some((m) => m.name === currentModel);
    if (isUnavailableModel && models.length > 0) {
      // show next model to default model if exist
      let nextModel = models.find((model) => model.isDefault) || models[0];
      chatStore.updateTargetSession(session, (session) => {
        session.mask.modelConfig.model = nextModel.name;
        session.mask.modelConfig.providerName = nextModel?.provider
          ?.providerName as ServiceProvider;
      });
    }
  }, [chatStore, currentModel, models, session, setAttachImages, setUploading]);

  const runMenuAction = (action: () => void) => {
    closeMenu();
    action();
  };

  return (
    <div
      className={clsx(
        styles["chat-input-actions"],
        menuMounted && styles["chat-input-actions-open"],
        menuState === "closing" && styles["chat-input-actions-closing"],
        inputFocused && styles["chat-input-actions-focused"],
        voiceActive && styles["chat-input-actions-recording"],
      )}
    >
      <button
        type="button"
        className={styles["chat-input-plus"]}
        data-testid="chat-input-plus"
        aria-label={voiceActive ? "取消录音" : Locale.UI.Config}
        aria-expanded={voiceActive ? false : menuExpanded}
        disabled={!voiceActive && menuMounted}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          if (voiceActive) {
            onCancelVoice();
          } else {
            openMenu();
          }
        }}
      >
        <span
          className={clsx(
            styles["chat-input-plus-icon"],
            voiceActive && styles["chat-input-cancel-icon"],
          )}
          aria-hidden="true"
        />
      </button>

      {menuMounted && (
        <div
          ref={menuRef}
          className={clsx(
            styles["chat-input-menu"],
            menuState === "open" && styles["chat-input-menu-open"],
            menuState === "closing" && styles["chat-input-menu-closing"],
          )}
          role="menu"
          aria-hidden={menuState === "closing"}
        >
          <button
            type="button"
            className={clsx(
              styles["chat-input-menu-item"],
              !showUploadImage && styles["chat-input-menu-item-disabled"],
            )}
            role="menuitem"
            aria-disabled={!showUploadImage}
            disabled={!showUploadImage}
            onClick={() => runMenuAction(uploadImage)}
          >
            <span className={styles["chat-input-menu-icon"]}>
              {uploading ? <LoadingButtonIcon /> : <MenuUploadIcon />}
            </span>
            <span>{Locale.Chat.InputActions.UploadImage}</span>
          </button>
          <button
            type="button"
            className={styles["chat-input-menu-item"]}
            role="menuitem"
            onClick={() => runMenuAction(nextTheme)}
          >
            <span className={styles["chat-input-menu-icon"]}>
              <MenuThemeIcon theme={theme} />
            </span>
            <span>{Locale.Chat.InputActions.Theme[theme]}</span>
          </button>
          <button
            type="button"
            className={styles["chat-input-menu-item"]}
            role="menuitem"
            onClick={() => runMenuAction(showPromptModal)}
          >
            <span className={styles["chat-input-menu-icon"]}>
              <MenuSettingsIcon />
            </span>
            <span>{Locale.Chat.InputActions.Settings}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function EditMessageModal(props: { onClose: () => void }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const [messages, setMessages] = useState(session.messages.slice());

  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Chat.EditMessage.Title}
        onClose={props.onClose}
        actions={[
          <IconButton
            text={Locale.UI.Cancel}
            icon={<CancelIcon />}
            key="cancel"
            onClick={() => {
              props.onClose();
            }}
          />,
          <IconButton
            type="primary"
            text={Locale.UI.Confirm}
            icon={<ConfirmIcon />}
            key="ok"
            onClick={() => {
              chatStore.updateTargetSession(
                session,
                (session) => (session.messages = messages),
              );
              props.onClose();
            }}
          />,
        ]}
      >
        <List>
          <ListItem
            title={Locale.Chat.EditMessage.Topic.Title}
            subTitle={Locale.Chat.EditMessage.Topic.SubTitle}
          >
            <input
              type="text"
              value={session.topic}
              onInput={(e) =>
                chatStore.updateTargetSession(
                  session,
                  (session) => (session.topic = e.currentTarget.value),
                )
              }
            ></input>
          </ListItem>
        </List>
        <ContextPrompts
          context={messages}
          updateContext={(updater) => {
            const newMessages = messages.slice();
            updater(newMessages);
            setMessages(newMessages);
          }}
        />
      </Modal>
    </div>
  );
}

export function DeleteImageButton(props: { deleteImage: () => void }) {
  return (
    <button
      type="button"
      className={styles["delete-image"]}
      aria-label={Locale.Chat.Actions.Delete}
      title={Locale.Chat.Actions.Delete}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.deleteImage();
      }}
    >
      <CloseIcon />
    </button>
  );
}

export function ShortcutKeyModal(props: { onClose: () => void }) {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcuts = [
    {
      title: Locale.Chat.ShortcutKey.newChat,
      keys: isMac ? ["⌘", "Shift", "O"] : ["Ctrl", "Shift", "O"],
    },
    { title: Locale.Chat.ShortcutKey.focusInput, keys: ["Shift", "Esc"] },
    {
      title: Locale.Chat.ShortcutKey.copyLastCode,
      keys: isMac ? ["⌘", "Shift", ";"] : ["Ctrl", "Shift", ";"],
    },
    {
      title: Locale.Chat.ShortcutKey.copyLastMessage,
      keys: isMac ? ["⌘", "Shift", "C"] : ["Ctrl", "Shift", "C"],
    },
    {
      title: Locale.Chat.ShortcutKey.showShortcutKey,
      keys: isMac ? ["⌘", "/"] : ["Ctrl", "/"],
    },
    {
      title: Locale.Chat.ShortcutKey.clearContext,
      keys: isMac
        ? ["⌘", "Shift", "backspace"]
        : ["Ctrl", "Shift", "backspace"],
    },
  ];
  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Chat.ShortcutKey.Title}
        onClose={props.onClose}
        actions={[
          <IconButton
            type="primary"
            text={Locale.UI.Confirm}
            icon={<ConfirmIcon />}
            key="ok"
            onClick={() => {
              props.onClose();
            }}
          />,
        ]}
      >
        <div className={styles["shortcut-key-container"]}>
          <div className={styles["shortcut-key-grid"]}>
            {shortcuts.map((shortcut, index) => (
              <div key={index} className={styles["shortcut-key-item"]}>
                <div className={styles["shortcut-key-title"]}>
                  {shortcut.title}
                </div>
                <div className={styles["shortcut-key-keys"]}>
                  {shortcut.keys.map((key, i) => (
                    <div key={i} className={styles["shortcut-key"]}>
                      <span>{key}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function _Chat() {
  type RenderMessage = ChatMessage & { preview?: boolean };

  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const config = useAppConfig();
  const fontSize = config.fontSize;
  const fontFamily = config.fontFamily;

  const [showExport, setShowExport] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [userInput, setUserInput] = useState("");
  const userInputRef = useRef("");
  const [inputFocused, setInputFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceInputState>("idle");
  const [voiceAnalyser, setVoiceAnalyser] = useState<AnalyserNode | null>(null);
  const voiceMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStopActionRef = useRef<VoiceStopAction>("insert");
  const voiceStartedAtRef = useRef(0);
  const voiceTimeoutRef = useRef<number | null>(null);
  const voiceAbortControllerRef = useRef<AbortController | null>(null);
  const voiceSessionRef = useRef(0);
  const { submitKey, shouldSubmit } = useSubmitHandler();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  useMobileRubberBandScroll(scrollRef, scrollContentRef);
  const isScrolledToBottom = scrollRef?.current
    ? Math.abs(
        scrollRef.current.scrollHeight -
          (scrollRef.current.scrollTop + scrollRef.current.clientHeight),
      ) <= 1
    : false;
  const isAttachWithTop = useMemo(() => {
    const lastMessage = scrollContentRef.current
      ?.lastElementChild as HTMLElement;
    // if scrolllRef is not ready or no message, return false
    if (!scrollRef?.current || !lastMessage) return false;
    const topDistance =
      lastMessage!.getBoundingClientRect().top -
      scrollRef.current.getBoundingClientRect().top;
    // leave some space for user question
    return topDistance < 100;
  }, [scrollRef?.current?.scrollHeight]);

  const isTyping = userInput !== "";

  // if user is typing, should auto scroll to bottom
  // if user is not typing, should auto scroll to bottom only if already at bottom
  const { setAutoScroll, scrollDomToBottom } = useScrollToBottom(
    scrollRef,
    (isScrolledToBottom || isAttachWithTop) && !isTyping,
    session.messages,
  );
  const [hitBottom, setHitBottom] = useState(true);
  const isMobileScreen = useMobileScreen();
  const navigate = useNavigate();
  const [attachImages, setAttachImages] = useState<string[]>([]);
  const attachmentScrollRef = useRef<HTMLDivElement>(null);
  const attachmentTrackRef = useRef<HTMLDivElement>(null);
  const previousAttachmentCountRef = useRef(0);
  useMobileHorizontalRubberBandScroll(
    attachmentScrollRef,
    attachmentTrackRef,
    attachImages.length > 0,
  );
  const [uploading, setUploading] = useState(false);
  const isVoiceStarting = voiceState === "starting";
  const isVoiceRecording = voiceState === "recording";
  const isVoiceTranscribing = voiceState === "transcribing";
  const isVoiceActive = voiceState !== "idle";
  const canSubmit = userInput.trim().length > 0 || attachImages.length > 0;
  const canUseSendButton = canSubmit || isVoiceRecording;
  const inputExpanded =
    !isVoiceActive &&
    (inputFocused || userInput.length > 0 || attachImages.length > 0);

  useEffect(() => {
    const previousCount = previousAttachmentCountRef.current;
    previousAttachmentCountRef.current = attachImages.length;
    if (attachImages.length <= previousCount) return;

    const frame = window.requestAnimationFrame(() => {
      const scrollElement = attachmentScrollRef.current;
      if (!scrollElement) return;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      scrollElement.scrollTo({
        left: scrollElement.scrollWidth,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [attachImages.length]);

  // prompt hints
  const promptStore = usePromptStore();
  const [promptHints, setPromptHints] = useState<RenderPrompt[]>([]);
  const onSearch = useDebouncedCallback(
    (text: string) => {
      const matchedPrompts = promptStore.search(text);
      setPromptHints(matchedPrompts);
    },
    100,
    { leading: true, trailing: true },
  );

  // auto grow input
  const [inputRows, setInputRows] = useState(1);
  const measure = useDebouncedCallback(
    () => {
      const rows = inputRef.current ? autoGrowTextArea(inputRef.current) : 1;
      const inputRows = Math.min(20, Math.max(1, rows));
      setInputRows(inputRows);
    },
    100,
    {
      leading: true,
      trailing: true,
    },
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(measure, [userInput]);

  useEffect(() => {
    userInputRef.current = userInput;
  }, [userInput]);

  // chat commands shortcuts
  const chatCommands = useChatCommand({
    new: () => chatStore.newSession(),
    newm: () => chatStore.newSession(),
    prev: () => chatStore.nextSession(-1),
    next: () => chatStore.nextSession(1),
    clear: () =>
      chatStore.updateTargetSession(
        session,
        (session) => (session.clearContextIndex = session.messages.length),
      ),
    fork: () => chatStore.forkSession(),
    del: () => chatStore.deleteSession(chatStore.currentSessionIndex),
  });

  // only search prompts when user input is short
  const SEARCH_TEXT_LIMIT = 30;
  const onInput = (text: string) => {
    setUserInput(text);
    const n = text.trim().length;

    // clear search results
    if (n === 0) {
      setPromptHints([]);
    } else if (text.match(ChatCommandPrefix)) {
      setPromptHints(chatCommands.search(text));
    } else if (!config.disablePromptHint && n < SEARCH_TEXT_LIMIT) {
      // check if need to trigger auto completion
      if (text.startsWith("/")) {
        let searchText = text.slice(1);
        onSearch(searchText);
      }
    }
  };

  const doSubmit = (userInput: string) => {
    if (userInput.trim() === "" && isEmpty(attachImages)) return;
    const matchCommand = chatCommands.match(userInput);
    if (matchCommand.matched) {
      setUserInput("");
      setPromptHints([]);
      matchCommand.invoke();
      return;
    }
    setIsLoading(true);
    chatStore
      .onUserInput(userInput, attachImages)
      .then(() => setIsLoading(false));
    setAttachImages([]);
    chatStore.setLastInput(userInput);
    setUserInput("");
    userInputRef.current = "";
    setPromptHints([]);
    if (!isMobileScreen) inputRef.current?.focus();
    setAutoScroll(true);
  };

  const releaseVoiceMedia = (updateUi = true) => {
    if (voiceTimeoutRef.current !== null) {
      window.clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }

    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    voiceMediaRecorderRef.current = null;
    if (updateUi) setVoiceAnalyser(null);

    const audioContext = voiceAudioContextRef.current;
    voiceAudioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
  };

  const transcribeVoice = async (
    audioBlob: Blob,
    action: Exclude<VoiceStopAction, "cancel">,
    durationMs: number,
    voiceSession: number,
  ) => {
    const controller = new AbortController();
    voiceAbortControllerRef.current = controller;
    setVoiceState("transcribing");

    try {
      const accessStore = useAccessStore.getState();
      const headers: Record<string, string> = {
        "Content-Type": audioBlob.type || "audio/webm",
        "X-Audio-Duration-Ms": String(durationMs),
      };

      if (accessStore.enabledAccessControl() && accessStore.accessCode) {
        headers.Authorization = `Bearer ${ACCESS_CODE_PREFIX}${accessStore.accessCode}`;
      }

      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers,
        body: audioBlob,
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        text?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || "语音转文字失败");
      }

      const transcript = payload.text?.trim() ?? "";
      if (!transcript) {
        throw new Error("没有识别到清晰的语音内容");
      }
      if (voiceSessionRef.current !== voiceSession) return;

      const finalInput = appendTranscript(userInputRef.current, transcript);
      if (action === "send") {
        doSubmit(finalInput);
      } else {
        userInputRef.current = finalInput;
        setUserInput(finalInput);
        window.requestAnimationFrame(() => inputRef.current?.focus());
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      showToast(
        error instanceof Error ? error.message : "语音转文字失败，请稍后重试",
      );
    } finally {
      if (voiceAbortControllerRef.current === controller) {
        voiceAbortControllerRef.current = null;
      }
      if (voiceSessionRef.current === voiceSession) {
        setVoiceState("idle");
      }
    }
  };

  const stopVoiceRecording = (action: Exclude<VoiceStopAction, "cancel">) => {
    const recorder = voiceMediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    voiceStopActionRef.current = action;
    if (voiceTimeoutRef.current !== null) {
      window.clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }
    setVoiceState("transcribing");
    recorder.stop();
  };

  const cancelVoiceInput = () => {
    voiceSessionRef.current += 1;
    voiceAbortControllerRef.current?.abort();
    voiceAbortControllerRef.current = null;
    voiceStopActionRef.current = "cancel";

    const recorder = voiceMediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      releaseVoiceMedia();
    }

    voiceChunksRef.current = [];
    setVoiceState("idle");
  };

  const startVoiceRecording = async () => {
    if (voiceState !== "idle") return;

    const voiceSession = voiceSessionRef.current + 1;
    voiceSessionRef.current = voiceSession;
    voiceStopActionRef.current = "insert";
    voiceChunksRef.current = [];
    setPromptHints([]);
    setInputFocused(false);
    inputRef.current?.blur();
    setVoiceState("starting");

    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error("当前浏览器不支持麦克风录音");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (voiceSessionRef.current !== voiceSession) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      voiceStreamRef.current = stream;

      const AudioContextConstructor =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (AudioContextConstructor) {
        try {
          const audioContext = new AudioContextConstructor();
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.78;
          source.connect(analyser);
          voiceAudioContextRef.current = audioContext;
          setVoiceAnalyser(analyser);
          await audioContext.resume();
        } catch (error) {
          console.warn("[Voice Input] waveform analyser unavailable", error);
          const audioContext = voiceAudioContextRef.current;
          voiceAudioContextRef.current = null;
          if (audioContext && audioContext.state !== "closed") {
            void audioContext.close().catch(() => undefined);
          }
          setVoiceAnalyser(null);
        }
      }

      const preferredMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ];
      const mimeType = preferredMimeTypes.find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      voiceMediaRecorderRef.current = recorder;
      voiceStartedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        showToast("录音失败，请检查麦克风权限后重试");
        cancelVoiceInput();
      };

      recorder.onstop = () => {
        const action = voiceStopActionRef.current;
        const durationMs = Math.max(0, Date.now() - voiceStartedAtRef.current);
        const chunks = voiceChunksRef.current;
        voiceChunksRef.current = [];
        const blobType = recorder.mimeType || mimeType || "audio/webm";
        releaseVoiceMedia();

        if (action === "cancel" || voiceSessionRef.current !== voiceSession) {
          return;
        }

        const audioBlob = new Blob(chunks, { type: blobType });
        if (audioBlob.size === 0) {
          setVoiceState("idle");
          showToast("没有检测到有效录音");
          return;
        }
        if (audioBlob.size > MAX_VOICE_AUDIO_BYTES) {
          setVoiceState("idle");
          showToast("录音文件过大，请缩短后重试");
          return;
        }

        void transcribeVoice(audioBlob, action, durationMs, voiceSession);
      };

      recorder.start(250);
      setVoiceState("recording");
      voiceTimeoutRef.current = window.setTimeout(() => {
        if (
          voiceSessionRef.current === voiceSession &&
          recorder.state === "recording"
        ) {
          voiceStopActionRef.current = "insert";
          setVoiceState("transcribing");
          recorder.stop();
          showToast("已达到 60 秒录音上限");
        }
      }, MAX_VOICE_RECORDING_MS);
    } catch (error) {
      if (voiceSessionRef.current !== voiceSession) return;
      releaseVoiceMedia();
      setVoiceState("idle");
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "未获得麦克风权限，请在浏览器设置中允许访问"
          : error instanceof Error
          ? error.message
          : "无法启动麦克风";
      showToast(message);
    }
  };

  useEffect(() => {
    return () => {
      voiceSessionRef.current += 1;
      voiceAbortControllerRef.current?.abort();
      const recorder = voiceMediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        voiceStopActionRef.current = "cancel";
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        recorder.stop();
      }
      releaseVoiceMedia(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPromptSelect = (prompt: RenderPrompt) => {
    setTimeout(() => {
      setPromptHints([]);

      const matchedChatCommand = chatCommands.match(prompt.content);
      if (matchedChatCommand.matched) {
        // if user is selecting a chat command, just trigger it
        matchedChatCommand.invoke();
        setUserInput("");
      } else {
        // or fill the prompt
        setUserInput(prompt.content);
      }
      inputRef.current?.focus();
    }, 30);
  };

  // stop response
  const onUserStop = (messageId: string) => {
    ChatControllerPool.stop(session.id, messageId);
  };

  useEffect(() => {
    chatStore.updateTargetSession(session, (session) => {
      const stopTiming = Date.now() - REQUEST_TIMEOUT_MS;
      session.messages.forEach((m) => {
        // check if should stop all stale messages
        if (m.isError || new Date(m.date).getTime() < stopTiming) {
          if (m.streaming) {
            m.streaming = false;
          }

          if (m.content.length === 0) {
            m.isError = true;
            m.content = prettyObject({
              error: true,
              message: "empty response",
            });
          }
        }
      });

      // auto sync mask config from global config
      if (session.mask.syncGlobalConfig) {
        console.log("[Mask] syncing from global, name = ", session.mask.name);
        session.mask.modelConfig = { ...config.modelConfig };
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // check if should send message
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // if ArrowUp and no userInput, fill with last input
    if (
      e.key === "ArrowUp" &&
      userInput.length <= 0 &&
      !(e.metaKey || e.altKey || e.ctrlKey)
    ) {
      setUserInput(chatStore.lastInput ?? "");
      e.preventDefault();
      return;
    }
    if (shouldSubmit(e) && promptHints.length === 0) {
      doSubmit(userInput);
      e.preventDefault();
    }
  };
  const onRightClick = (e: any, message: ChatMessage) => {
    // copy to clipboard
    if (selectOrCopy(e.currentTarget, getMessageTextContent(message))) {
      if (userInput.length === 0) {
        setUserInput(getMessageTextContent(message));
      }

      e.preventDefault();
    }
  };

  const deleteMessage = (msgId?: string) => {
    chatStore.updateTargetSession(
      session,
      (session) =>
        (session.messages = session.messages.filter((m) => m.id !== msgId)),
    );
  };

  const onDelete = (msgId: string) => {
    deleteMessage(msgId);
  };

  const onEditMessage = async (message: ChatMessage) => {
    const newMessage = await showPrompt(
      Locale.Chat.Actions.Edit,
      getMessageTextContent(message),
      10,
    );
    let newContent: string | MultimodalContent[] = newMessage;
    const images = getMessageImages(message);

    if (images.length > 0) {
      newContent = [{ type: "text", text: newMessage }];
      for (const image of images) {
        newContent.push({
          type: "image_url",
          image_url: { url: image },
        });
      }
    }

    chatStore.updateTargetSession(session, (session) => {
      const targetMessage = session.mask.context
        .concat(session.messages)
        .find((item) => item.id === message.id);
      if (targetMessage) targetMessage.content = newContent;
    });
  };

  const onResend = (message: ChatMessage) => {
    // when it is resending a message
    // 1. for a user's message, find the next bot response
    // 2. for a bot's message, find the last user's input
    // 3. delete original user input and bot's message
    // 4. resend the user's input

    const resendingIndex = session.messages.findIndex(
      (m) => m.id === message.id,
    );

    if (resendingIndex < 0 || resendingIndex >= session.messages.length) {
      console.error("[Chat] failed to find resending message", message);
      return;
    }

    let userMessage: ChatMessage | undefined;
    let botMessage: ChatMessage | undefined;

    if (message.role === "assistant") {
      // if it is resending a bot's message, find the user input for it
      botMessage = message;
      for (let i = resendingIndex; i >= 0; i -= 1) {
        if (session.messages[i].role === "user") {
          userMessage = session.messages[i];
          break;
        }
      }
    } else if (message.role === "user") {
      // if it is resending a user's input, find the bot's response
      userMessage = message;
      for (let i = resendingIndex; i < session.messages.length; i += 1) {
        if (session.messages[i].role === "assistant") {
          botMessage = session.messages[i];
          break;
        }
      }
    }

    if (userMessage === undefined) {
      console.error("[Chat] failed to resend", message);
      return;
    }

    // delete the original messages
    deleteMessage(userMessage.id);
    deleteMessage(botMessage?.id);

    // resend the message
    setIsLoading(true);
    const textContent = getMessageTextContent(userMessage);
    const images = getMessageImages(userMessage);
    chatStore.onUserInput(textContent, images).then(() => setIsLoading(false));
    inputRef.current?.focus();
  };

  const onPinMessage = (message: ChatMessage) => {
    chatStore.updateTargetSession(session, (session) =>
      session.mask.context.push(message),
    );

    showToast(Locale.Chat.Actions.PinToastContent, {
      text: Locale.Chat.Actions.PinToastAction,
      onClick: () => {
        setShowPromptModal(true);
      },
    });
  };

  const accessStore = useAccessStore();
  const [speechStatus, setSpeechStatus] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);

  async function openaiSpeech(text: string) {
    if (speechStatus) {
      ttsPlayer.stop();
      setSpeechStatus(false);
    } else {
      var api: ClientApi;
      api = new ClientApi(ModelProvider.GPT);
      const config = useAppConfig.getState();
      setSpeechLoading(true);
      ttsPlayer.init();
      let audioBuffer: ArrayBuffer;
      const { markdownToTxt } = await import("markdown-to-txt");
      const textContent = markdownToTxt(text);
      if (config.ttsConfig.engine !== DEFAULT_TTS_ENGINE) {
        const { MsEdgeTTS, OUTPUT_FORMAT } = await import(
          "../utils/ms_edge_tts"
        );
        const edgeVoiceName = accessStore.edgeVoiceName();
        const tts = new MsEdgeTTS();
        await tts.setMetadata(
          edgeVoiceName,
          OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
        );
        audioBuffer = await tts.toArrayBuffer(textContent);
      } else {
        audioBuffer = await api.llm.speech({
          model: config.ttsConfig.model,
          input: textContent,
          voice: config.ttsConfig.voice,
          speed: config.ttsConfig.speed,
        });
      }
      setSpeechStatus(true);
      ttsPlayer
        .play(audioBuffer, () => {
          setSpeechStatus(false);
        })
        .catch((e) => {
          console.error("[OpenAI Speech]", e);
          showToast(prettyObject(e));
          setSpeechStatus(false);
        })
        .finally(() => setSpeechLoading(false));
    }
  }

  const context: RenderMessage[] = useMemo(() => {
    return session.mask.hideContext ? [] : session.mask.context.slice();
  }, [session.mask.context, session.mask.hideContext]);

  if (
    context.length === 0 &&
    session.messages.at(0)?.content !== BOT_HELLO.content
  ) {
    const copiedHello = Object.assign({}, BOT_HELLO);
    if (!accessStore.isAuthorized()) {
      copiedHello.content = Locale.Error.Unauthorized;
    }
    context.push(copiedHello);
  }

  // preview messages
  const renderMessages = useMemo(() => {
    return context
      .concat(session.messages as RenderMessage[])
      .concat(
        isLoading
          ? [
              {
                ...createMessage({
                  role: "assistant",
                  content: "……",
                }),
                preview: true,
              },
            ]
          : [],
      )
      .concat(
        userInput.length > 0 && config.sendPreviewBubble
          ? [
              {
                ...createMessage({
                  role: "user",
                  content: userInput,
                }),
                preview: true,
              },
            ]
          : [],
      );
  }, [
    config.sendPreviewBubble,
    context,
    isLoading,
    session.messages,
    userInput,
  ]);

  const [msgRenderIndex, _setMsgRenderIndex] = useState(
    Math.max(0, renderMessages.length - CHAT_PAGE_SIZE),
  );

  function setMsgRenderIndex(newIndex: number) {
    newIndex = Math.min(renderMessages.length - CHAT_PAGE_SIZE, newIndex);
    newIndex = Math.max(0, newIndex);
    _setMsgRenderIndex(newIndex);
  }

  const messages = useMemo(() => {
    const endRenderIndex = Math.min(
      msgRenderIndex + 3 * CHAT_PAGE_SIZE,
      renderMessages.length,
    );
    return renderMessages.slice(msgRenderIndex, endRenderIndex);
  }, [msgRenderIndex, renderMessages]);

  const onChatBodyScroll = (e: HTMLElement) => {
    const bottomHeight = e.scrollTop + e.clientHeight;
    const edgeThreshold = e.clientHeight;

    const isTouchTopEdge = e.scrollTop <= edgeThreshold;
    const isTouchBottomEdge = bottomHeight >= e.scrollHeight - edgeThreshold;
    const isHitBottom =
      bottomHeight >= e.scrollHeight - (isMobileScreen ? 4 : 10);

    const prevPageMsgIndex = msgRenderIndex - CHAT_PAGE_SIZE;
    const nextPageMsgIndex = msgRenderIndex + CHAT_PAGE_SIZE;

    if (isTouchTopEdge && !isTouchBottomEdge) {
      setMsgRenderIndex(prevPageMsgIndex);
    } else if (isTouchBottomEdge) {
      setMsgRenderIndex(nextPageMsgIndex);
    }

    setHitBottom(isHitBottom);
    setAutoScroll(isHitBottom);
  };

  function scrollToBottom() {
    setMsgRenderIndex(renderMessages.length - CHAT_PAGE_SIZE);
    scrollDomToBottom();
  }

  // clear context index = context length + index in messages
  const clearContextIndex =
    (session.clearContextIndex ?? -1) >= 0
      ? session.clearContextIndex! + context.length - msgRenderIndex
      : -1;

  const [showPromptModal, setShowPromptModal] = useState(false);

  const clientConfig = useMemo(() => getClientConfig(), []);

  const autoFocus = false;
  const showMaxIcon = !isMobileScreen && !clientConfig?.isApp;

  useCommand({
    fill: setUserInput,
    submit: (text) => {
      doSubmit(text);
    },
    code: (text) => {
      if (accessStore.disableFastLink) return;
      console.log("[Command] got code from url: ", text);
      showConfirm(Locale.URLCommand.Code + `code = ${text}`).then((res) => {
        if (res) {
          accessStore.update((access) => (access.accessCode = text));
        }
      });
    },
    settings: (text) => {
      if (accessStore.disableFastLink) return;

      try {
        const payload = JSON.parse(text) as {
          key?: string;
          url?: string;
        };

        console.log("[Command] got settings from url: ", payload);

        if (payload.key || payload.url) {
          showConfirm(
            Locale.URLCommand.Settings +
              `\n${JSON.stringify(payload, null, 4)}`,
          ).then((res) => {
            if (!res) return;
            if (payload.key) {
              accessStore.update(
                (access) => (access.openaiApiKey = payload.key!),
              );
            }
            if (payload.url) {
              accessStore.update((access) => (access.openaiUrl = payload.url!));
            }
            accessStore.update((access) => (access.useCustomConfig = true));
          });
        }
      } catch {
        console.error("[Command] failed to get settings from url: ", text);
      }
    },
  });

  // edit / insert message modal
  const [isEditingMessage, setIsEditingMessage] = useState(false);

  // remember unfinished input
  useEffect(() => {
    // try to load from local storage
    const key = UNFINISHED_INPUT(session.id);
    const mayBeUnfinishedInput = localStorage.getItem(key);
    if (mayBeUnfinishedInput && userInput.length === 0) {
      setUserInput(mayBeUnfinishedInput);
      localStorage.removeItem(key);
    }

    const dom = inputRef.current;
    return () => {
      localStorage.setItem(key, dom?.value ?? "");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addImageFiles = useCallback(
    async (files: File[]) => {
      const remainingSlots = Math.max(
        0,
        MAX_ATTACH_IMAGES - attachImages.length,
      );
      if (remainingSlots === 0) {
        showToast(`最多可添加 ${MAX_ATTACH_IMAGES} 张图片`);
        return;
      }

      const acceptedFiles = files.slice(0, remainingSlots);
      if (files.length > remainingSlots) {
        showToast(`最多可添加 ${MAX_ATTACH_IMAGES} 张图片`);
      }
      if (acceptedFiles.length === 0) return;

      setUploading(true);
      try {
        const uploadResults = await Promise.allSettled(
          acceptedFiles.map((file) => uploadImageRemote(file)),
        );
        const uploadedImages = uploadResults.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        if (uploadedImages.length > 0) {
          setAttachImages((currentImages) =>
            currentImages.concat(uploadedImages).slice(0, MAX_ATTACH_IMAGES),
          );
        }

        const failedUpload = uploadResults.find(
          (result) => result.status === "rejected",
        );
        if (failedUpload?.status === "rejected") {
          showToast(`部分图片上传失败：${prettyObject(failedUpload.reason)}`);
        }
      } finally {
        setUploading(false);
      }
    },
    [attachImages.length],
  );

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const currentModel = chatStore.currentSession().mask.modelConfig.model;
      if (!isVisionModel(currentModel)) return;

      const items = Array.from(
        (event.clipboardData || window.clipboardData).items,
      );
      const imageFiles = items
        .filter(
          (item) => item.kind === "file" && item.type.startsWith("image/"),
        )
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (imageFiles.length === 0) return;
      event.preventDefault();
      await addImageFiles(imageFiles);
    },
    [addImageFiles, chatStore],
  );

  async function uploadImage() {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept =
      "image/png, image/jpeg, image/webp, image/heic, image/heif";
    fileInput.multiple = true;
    fileInput.onchange = async (event) => {
      const files = Array.from(
        (event.currentTarget as HTMLInputElement).files ?? [],
      );
      await addImageFiles(files);
    };
    fileInput.click();
  }

  // 快捷键 shortcut keys
  const [showShortcutKeyModal, setShowShortcutKeyModal] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 打开新聊天 command + shift + o
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        setTimeout(() => {
          chatStore.newSession();
          navigate(Path.Chat);
        }, 10);
      }
      // 聚焦聊天输入 shift + esc
      else if (event.shiftKey && event.key.toLowerCase() === "escape") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      // 复制最后一个代码块 command + shift + ;
      else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.code === "Semicolon"
      ) {
        event.preventDefault();
        const copyCodeButton =
          document.querySelectorAll<HTMLElement>(".copy-code-button");
        if (copyCodeButton.length > 0) {
          copyCodeButton[copyCodeButton.length - 1].click();
        }
      }
      // 复制最后一个回复 command + shift + c
      else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        const lastNonUserMessage = messages
          .filter((message) => message.role !== "user")
          .pop();
        if (lastNonUserMessage) {
          const lastMessageContent = getMessageTextContent(lastNonUserMessage);
          copyToClipboard(lastMessageContent);
        }
      }
      // 展示快捷键 command + /
      else if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setShowShortcutKeyModal(true);
      }
      // 清除上下文 command + shift + backspace
      else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "backspace"
      ) {
        event.preventDefault();
        chatStore.updateTargetSession(session, (session) => {
          if (session.clearContextIndex === session.messages.length) {
            session.clearContextIndex = undefined;
          } else {
            session.clearContextIndex = session.messages.length;
            session.memoryPrompt = ""; // will clear memory
          }
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [messages, chatStore, navigate, session]);

  const [showChatSidePanel, setShowChatSidePanel] = useState(false);
  const displayTopic =
    session.topic && session.topic !== DEFAULT_TOPIC ? session.topic : "";

  return (
    <>
      <div className={styles.chat} key={session.id}>
        <div
          className={clsx("window-header", styles["chat-header"])}
          data-tauri-drag-region
        >
          {isMobileScreen && (
            <div className="window-actions">
              <div className={"window-action-button"}>
                <IconButton
                  icon={<ReturnIcon />}
                  className={styles["chat-header-icon-button"]}
                  title={Locale.Chat.Actions.ChatList}
                  aria={Locale.Chat.Actions.ChatList}
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("nextchat:open-mobile-drawer"),
                    )
                  }
                />
              </div>
            </div>
          )}

          <div
            className={clsx("window-header-title", styles["chat-body-title"])}
          >
            {displayTopic && (
              <button
                type="button"
                className={clsx(
                  "window-header-main-title",
                  styles["chat-body-main-title"],
                )}
                title={Locale.Chat.Rename}
                aria-label={Locale.Chat.Rename}
                onClick={() => setIsEditingMessage(true)}
              >
                {displayTopic}
              </button>
            )}
          </div>
          <div className="window-actions">
            <div className="window-action-button">
              <Popover
                open={showHeaderMenu}
                onClose={() => setShowHeaderMenu(false)}
                contentClassName={styles["chat-header-popover-content"]}
                maskClassName={styles["chat-header-popover-mask"]}
                contentRole="group"
                ariaLabel="会话操作"
                content={
                  <div className={styles["chat-header-menu"]}>
                    <IconButton
                      icon={<ReloadIcon />}
                      text={Locale.Chat.Actions.RefreshTitle}
                      className={styles["chat-header-menu-item"]}
                      onClick={() => {
                        setShowHeaderMenu(false);
                        showToast(Locale.Chat.Actions.RefreshToast);
                        chatStore.summarizeSession(true, session);
                      }}
                    />
                    <IconButton
                      icon={<RenameIcon />}
                      text={Locale.Chat.Rename}
                      className={styles["chat-header-menu-item"]}
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setIsEditingMessage(true);
                      }}
                    />
                    <IconButton
                      icon={<ExportIcon />}
                      text={Locale.Chat.Actions.Export}
                      className={styles["chat-header-menu-item"]}
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setShowExport(true);
                      }}
                    />
                    {showMaxIcon && (
                      <IconButton
                        icon={config.tightBorder ? <MinIcon /> : <MaxIcon />}
                        text={Locale.Chat.Actions.FullScreen}
                        className={styles["chat-header-menu-item"]}
                        onClick={() => {
                          setShowHeaderMenu(false);
                          config.update(
                            (config) =>
                              (config.tightBorder = !config.tightBorder),
                          );
                        }}
                      />
                    )}
                  </div>
                }
              >
                <IconButton
                  icon={<MenuIcon />}
                  className={styles["chat-header-icon-button"]}
                  title="更多操作"
                  aria="更多操作"
                  ariaExpanded={showHeaderMenu}
                  ariaHasPopup="menu"
                  onClick={() => setShowHeaderMenu((open) => !open)}
                />
              </Popover>
            </div>
          </div>

          <PromptToast
            showToast={!hitBottom}
            showModal={showPromptModal}
            setShowModal={setShowPromptModal}
          />
        </div>
        <div className={styles["chat-main"]}>
          <div className={styles["chat-body-container"]}>
            <div
              className={styles["chat-body"]}
              data-chat-scroll-body=""
              ref={scrollRef}
              onScroll={(e) => onChatBodyScroll(e.currentTarget)}
              onMouseDown={() => inputRef.current?.blur()}
              onTouchStart={() => {
                inputRef.current?.blur();
                setAutoScroll(false);
              }}
            >
              <div
                className={styles["mobile-rubber-band-content"]}
                ref={scrollContentRef}
              >
                {messages
                  // TODO
                  // .filter((m) => !m.isMcpResponse)
                  .map((message, i) => {
                    const isUser = message.role === "user";
                    const isContext = i < context.length;
                    const showActions =
                      i > 0 &&
                      !(message.preview || message.content.length === 0) &&
                      !isContext;
                    const showTyping = message.preview || message.streaming;

                    const shouldShowClearContextDivider =
                      i === clearContextIndex - 1;

                    return (
                      <Fragment key={message.id}>
                        <div
                          className={
                            isUser
                              ? styles["chat-message-user"]
                              : styles["chat-message"]
                          }
                        >
                          <div className={styles["chat-message-container"]}>
                            {message?.tools?.length == 0 && showTyping && (
                              <div className={styles["chat-message-status"]}>
                                {Locale.Chat.Typing}
                              </div>
                            )}
                            {/*@ts-ignore*/}
                            {message?.tools?.length > 0 && (
                              <div className={styles["chat-message-tools"]}>
                                {message?.tools?.map((tool) => (
                                  <div
                                    key={tool.id}
                                    title={tool?.errorMsg}
                                    className={styles["chat-message-tool"]}
                                  >
                                    {tool.isError === false ? (
                                      <ConfirmIcon />
                                    ) : tool.isError === true ? (
                                      <CloseIcon />
                                    ) : (
                                      <LoadingButtonIcon />
                                    )}
                                    <span>{tool?.function?.name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className={styles["chat-message-item"]}>
                              <Markdown
                                key={message.streaming ? "loading" : "done"}
                                content={getMessageTextContent(message)}
                                loading={
                                  (message.preview || message.streaming) &&
                                  message.content.length === 0 &&
                                  !isUser
                                }
                                //   onContextMenu={(e) => onRightClick(e, message)} // hard to use
                                onDoubleClickCapture={() => {
                                  if (!isMobileScreen) return;
                                  setUserInput(getMessageTextContent(message));
                                }}
                                fontSize={fontSize}
                                fontFamily={fontFamily}
                                parentRef={scrollRef}
                                defaultShow={i >= messages.length - 6}
                              />
                              {getMessageImages(message).length == 1 && (
                                <img
                                  className={styles["chat-message-item-image"]}
                                  src={getMessageImages(message)[0]}
                                  alt=""
                                />
                              )}
                              {getMessageImages(message).length > 1 && (
                                <div
                                  className={styles["chat-message-item-images"]}
                                  style={
                                    {
                                      "--image-count":
                                        getMessageImages(message).length,
                                    } as React.CSSProperties
                                  }
                                >
                                  {getMessageImages(message).map(
                                    (image, index) => {
                                      return (
                                        <img
                                          className={
                                            styles[
                                              "chat-message-item-image-multi"
                                            ]
                                          }
                                          key={index}
                                          src={image}
                                          alt=""
                                        />
                                      );
                                    },
                                  )}
                                </div>
                              )}
                            </div>
                            {message?.audio_url && (
                              <div className={styles["chat-message-audio"]}>
                                <audio src={message.audio_url} controls />
                              </div>
                            )}

                            {showActions && (
                              <div className={styles["chat-message-actions"]}>
                                <div className={styles["chat-input-actions"]}>
                                  {message.streaming ? (
                                    <ChatAction
                                      text={Locale.Chat.Actions.Stop}
                                      icon={<StopIcon />}
                                      onClick={() =>
                                        onUserStop(message.id ?? i)
                                      }
                                    />
                                  ) : (
                                    <>
                                      {isUser && (
                                        <ChatAction
                                          text={Locale.Chat.Actions.Edit}
                                          icon={<EditIcon />}
                                          onClick={() => onEditMessage(message)}
                                        />
                                      )}
                                      <ChatAction
                                        text={Locale.Chat.Actions.Retry}
                                        icon={<ResetIcon />}
                                        onClick={() => onResend(message)}
                                      />
                                      <ChatAction
                                        text={Locale.Chat.Actions.Delete}
                                        icon={<DeleteIcon />}
                                        onClick={() =>
                                          onDelete(message.id ?? i)
                                        }
                                      />
                                      <ChatAction
                                        text={Locale.Chat.Actions.Pin}
                                        icon={<PinIcon />}
                                        onClick={() => onPinMessage(message)}
                                      />
                                      <ChatAction
                                        text={Locale.Chat.Actions.Copy}
                                        icon={<CopyIcon />}
                                        onClick={() =>
                                          copyToClipboard(
                                            getMessageTextContent(message),
                                          )
                                        }
                                      />
                                      {config.ttsConfig.enable && (
                                        <ChatAction
                                          text={
                                            speechStatus
                                              ? Locale.Chat.Actions.StopSpeech
                                              : Locale.Chat.Actions.Speech
                                          }
                                          icon={
                                            speechStatus ? (
                                              <SpeakStopIcon />
                                            ) : (
                                              <SpeakIcon />
                                            )
                                          }
                                          onClick={() =>
                                            openaiSpeech(
                                              getMessageTextContent(message),
                                            )
                                          }
                                        />
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            )}

                            <div className={styles["chat-message-action-date"]}>
                              {isContext
                                ? Locale.Chat.IsContext
                                : message.date.toLocaleString()}
                            </div>
                          </div>
                        </div>
                        {shouldShowClearContextDivider && (
                          <ClearContextDivider />
                        )}
                      </Fragment>
                    );
                  })}
              </div>
            </div>
            <div className={styles["chat-input-panel"]}>
              <PromptHints
                prompts={promptHints}
                onPromptSelect={onPromptSelect}
              />

              <ChatActions
                uploadImage={uploadImage}
                setAttachImages={setAttachImages}
                setUploading={setUploading}
                showPromptModal={() => setShowPromptModal(true)}
                uploading={uploading}
                inputFocused={inputFocused}
                voiceActive={isVoiceActive}
                onCancelVoice={cancelVoiceInput}
              />
              <IntelligenceSelector
                visible={inputExpanded}
                disabled={isLoading || isVoiceActive}
              />
              <label
                className={clsx(styles["chat-input-panel-inner"], {
                  [styles["chat-input-panel-inner-expanded"]]: inputExpanded,
                  [styles["chat-input-panel-inner-attach"]]:
                    attachImages.length !== 0 && !isVoiceActive,
                  [styles["chat-input-panel-inner-recording"]]: isVoiceActive,
                })}
                htmlFor="chat-input"
              >
                {attachImages.length !== 0 && !isVoiceActive && (
                  <div
                    ref={attachmentScrollRef}
                    className={styles["attach-images"]}
                    data-horizontal-gesture-surface=""
                    aria-label={`已上传 ${attachImages.length} 张图片`}
                  >
                    <div
                      ref={attachmentTrackRef}
                      className={styles["attach-images-track"]}
                    >
                      {attachImages.map((image, index) => (
                        <div
                          key={`${image}-${index}`}
                          className={styles["attach-image"]}
                          style={{ backgroundImage: `url("${image}")` }}
                        >
                          <div className={styles["attach-image-mask"]}>
                            <DeleteImageButton
                              deleteImage={() => {
                                setAttachImages(
                                  attachImages.filter((_, i) => i !== index),
                                );
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!isVoiceActive ? (
                  <textarea
                    id="chat-input"
                    ref={inputRef}
                    className={styles["chat-input"]}
                    placeholder={Locale.Chat.Input(submitKey)}
                    onInput={(e) => onInput(e.currentTarget.value)}
                    value={userInput}
                    onKeyDown={onInputKeyDown}
                    onFocus={() => {
                      setInputFocused(true);
                      scrollToBottom();
                    }}
                    onBlur={() => setInputFocused(false)}
                    onClick={scrollToBottom}
                    onPaste={handlePaste}
                    rows={inputRows}
                    autoFocus={autoFocus}
                    style={{
                      fontSize: config.fontSize,
                      fontFamily: config.fontFamily,
                    }}
                  />
                ) : (
                  <div
                    className={styles["chat-input-voice-status"]}
                    role="status"
                    aria-live="polite"
                  >
                    {isVoiceRecording ? (
                      <VoiceWaveform analyser={voiceAnalyser} active />
                    ) : (
                      <span className={styles["chat-input-voice-status-text"]}>
                        {isVoiceStarting ? "正在启动麦克风…" : "正在转写…"}
                      </span>
                    )}
                  </div>
                )}
                {!isVoiceActive && (
                  <div
                    className={styles["chat-input-toolbar"]}
                    aria-hidden="true"
                  />
                )}
                <button
                  type="button"
                  className={clsx(
                    styles["chat-input-voice"],
                    isVoiceRecording && styles["chat-input-voice-recording"],
                    (isVoiceStarting || isVoiceTranscribing) &&
                      styles["chat-input-voice-busy"],
                  )}
                  aria-label={
                    isVoiceRecording ? "停止录音并转成文字" : "开始语音输入"
                  }
                  title={isVoiceRecording ? "停止录音并转成文字" : "语音输入"}
                  disabled={isVoiceStarting || isVoiceTranscribing}
                  onClick={(event) => {
                    event.preventDefault();
                    if (isVoiceRecording) {
                      stopVoiceRecording("insert");
                    } else if (!isVoiceActive) {
                      void startVoiceRecording();
                    }
                  }}
                >
                  {isVoiceRecording ? (
                    <span
                      className={styles["chat-input-voice-stop-square"]}
                      aria-hidden="true"
                    />
                  ) : isVoiceStarting || isVoiceTranscribing ? (
                    <span
                      className={styles["chat-input-voice-spinner"]}
                      aria-hidden="true"
                    />
                  ) : (
                    <MicrophoneIcon />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={
                    isVoiceRecording ? "结束录音并发送" : Locale.Chat.Send
                  }
                  title={isVoiceRecording ? "结束录音并发送" : Locale.Chat.Send}
                  data-testid="chat-input-send"
                  disabled={!canUseSendButton}
                  className={clsx(
                    styles["chat-input-send"],
                    canUseSendButton && styles["chat-input-send-active"],
                  )}
                  onClick={(event) => {
                    event.preventDefault();
                    if (isVoiceRecording) {
                      stopVoiceRecording("send");
                    } else if (canSubmit) {
                      doSubmit(userInput);
                    }
                  }}
                >
                  <svg
                    className={styles["chat-input-send-icon"]}
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M10 15.8V4.9" />
                    <path d="M5.4 9.5 10 4.9l4.6 4.6" />
                  </svg>
                </button>
              </label>
            </div>
          </div>
          <div
            className={clsx(styles["chat-side-panel"], {
              [styles["mobile"]]: isMobileScreen,
              [styles["chat-side-panel-show"]]: showChatSidePanel,
            })}
          >
            {showChatSidePanel && (
              <RealtimeChat
                onClose={() => {
                  setShowChatSidePanel(false);
                }}
                onStartVoice={async () => {
                  console.log("start voice");
                }}
              />
            )}
          </div>
        </div>
      </div>
      {showExport && (
        <ExportMessageModal onClose={() => setShowExport(false)} />
      )}

      {isEditingMessage && (
        <EditMessageModal
          onClose={() => {
            setIsEditingMessage(false);
          }}
        />
      )}

      {showShortcutKeyModal && (
        <ShortcutKeyModal onClose={() => setShowShortcutKeyModal(false)} />
      )}
    </>
  );
}

export function Chat() {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  return <_Chat key={session.id}></_Chat>;
}

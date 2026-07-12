"use client";

require("../polyfill");

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import styles from "./home.module.scss";

import BotIcon from "../icons/bot.svg";
import LoadingIcon from "../icons/three-dots.svg";

import { getCSSVar, useMobileScreen } from "../utils";

import dynamic from "next/dynamic";
import { Path, SlotID } from "../constant";
import { ErrorBoundary } from "./error";

import { getISOLang, getLang } from "../locales";

import {
  HashRouter as Router,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { SideBar } from "./sidebar";
import { useAppConfig } from "../store/config";
import { AuthPage } from "./auth";
import { getClientConfig } from "../config/client";
import { type ClientApi, getClientApi } from "../client/api";
import { useAccessStore } from "../store";
import clsx from "clsx";
import { initializeMcpSystem, isMcpEnabled } from "../mcp/actions";

export function Loading(props: { noLogo?: boolean }) {
  return (
    <div className={clsx("no-dark", styles["loading-content"])}>
      {!props.noLogo && <BotIcon />}
      <LoadingIcon />
    </div>
  );
}

const Artifacts = dynamic(async () => (await import("./artifacts")).Artifacts, {
  loading: () => <Loading noLogo />,
});

const Settings = dynamic(async () => (await import("./settings")).Settings, {
  loading: () => <Loading noLogo />,
});

const Chat = dynamic(async () => (await import("./chat")).Chat, {
  loading: () => <Loading noLogo />,
});

const NewChat = dynamic(async () => (await import("./new-chat")).NewChat, {
  loading: () => <Loading noLogo />,
});

const MaskPage = dynamic(async () => (await import("./mask")).MaskPage, {
  loading: () => <Loading noLogo />,
});

const PluginPage = dynamic(async () => (await import("./plugin")).PluginPage, {
  loading: () => <Loading noLogo />,
});

const SearchChat = dynamic(
  async () => (await import("./search-chat")).SearchChatPage,
  {
    loading: () => <Loading noLogo />,
  },
);

const Sd = dynamic(async () => (await import("./sd")).Sd, {
  loading: () => <Loading noLogo />,
});

const McpMarketPage = dynamic(
  async () => (await import("./mcp-market")).McpMarketPage,
  {
    loading: () => <Loading noLogo />,
  },
);

export function useSwitchTheme() {
  const config = useAppConfig();

  useEffect(() => {
    document.body.classList.remove("light");
    document.body.classList.remove("dark");

    if (config.theme === "dark") {
      document.body.classList.add("dark");
    } else if (config.theme === "light") {
      document.body.classList.add("light");
    }

    const metaDescriptionDark = document.querySelector(
      'meta[name="theme-color"][media*="dark"]',
    );
    const metaDescriptionLight = document.querySelector(
      'meta[name="theme-color"][media*="light"]',
    );

    if (config.theme === "auto") {
      metaDescriptionDark?.setAttribute("content", "#121214");
      metaDescriptionLight?.setAttribute("content", "#f7f8f9");
    } else {
      const themeColor = getCSSVar("--theme-color");
      metaDescriptionDark?.setAttribute("content", themeColor);
      metaDescriptionLight?.setAttribute("content", themeColor);
    }
  }, [config.theme]);
}

function useHtmlLang() {
  useEffect(() => {
    const lang = getISOLang();
    const htmlLang = document.documentElement.lang;

    if (lang !== htmlLang) {
      document.documentElement.lang = lang;
    }
  }, []);
}

const useHasHydrated = () => {
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
};

export const WindowContent = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode } & HTMLAttributes<HTMLDivElement>
>(function WindowContent(props, ref) {
  const { children, className, ...rest } = props;

  return (
    <div
      ref={ref}
      className={clsx(styles["window-content"], className)}
      id={SlotID.AppBody}
      {...rest}
    >
      {children}
    </div>
  );
});

const MOBILE_DRAWER_EVENT = "nextchat:open-mobile-drawer";
const DRAWER_INTENT_THRESHOLD = 11;
const DRAWER_INTENT_RATIO = 1.25;
const DRAWER_VELOCITY_THRESHOLD = 650;

function isSelectionActive() {
  const selection = window.getSelection?.();
  return !!selection && selection.type === "Range" && !selection.isCollapsed;
}

function isHorizontallyScrollable(element: HTMLElement | null) {
  let node = element;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const canScrollX =
      /(auto|scroll)/.test(style.overflowX) &&
      node.scrollWidth > node.clientWidth + 1;
    if (canScrollX) return true;
    node = node.parentElement;
  }
  return false;
}

function shouldIgnoreDrawerGesture(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  if (isSelectionActive()) return true;

  const ignoredTarget = target.closest(
    [
      "input",
      "textarea",
      "select",
      "button",
      "a",
      "[contenteditable]",
      "[role='dialog']",
      "dialog",
      "[popover]",
      ".modal-mask",
      "code",
      "pre",
      "img",
      "video",
      "audio",
      "canvas",
      "iframe",
    ].join(","),
  );

  return !!ignoredTarget || isHorizontallyScrollable(target);
}

function getDrawerDistance() {
  return Math.min(window.innerWidth * 0.74, 320);
}

function clampDrawerOffset(value: number, maxDistance: number) {
  return Math.min(maxDistance, Math.max(0, value));
}

function projectDrawerOffset(offset: number, velocityX: number) {
  const decelerationRate = 0.995;
  return (
    offset + (velocityX / 1000) * (decelerationRate / (1 - decelerationRate))
  );
}

function getPresentedDrawerOffset(
  element: HTMLElement | null,
  maxDistance: number,
  fallback: number,
) {
  if (!element) return clampDrawerOffset(fallback, maxDistance);

  const transform = window.getComputedStyle(element).transform;
  if (!transform || transform === "none") {
    return clampDrawerOffset(fallback, maxDistance);
  }

  try {
    return clampDrawerOffset(new DOMMatrixReadOnly(transform).m41, maxDistance);
  } catch {
    const matrixValues = transform.match(/matrix.*\((.+)\)/)?.[1]?.split(",");
    const translateX = matrixValues ? Number(matrixValues[4]) : NaN;
    return clampDrawerOffset(
      Number.isFinite(translateX) ? translateX : fallback,
      maxDistance,
    );
  }
}

function findTouch(touches: TouchList, identifier: number) {
  for (let i = 0; i < touches.length; i += 1) {
    const touch = touches.item(i);
    if (touch?.identifier === identifier) return touch;
  }
}

function Screen() {
  const config = useAppConfig();
  const location = useLocation();
  const isArtifact = location.pathname.includes(Path.Artifacts);
  const isAuth = location.pathname === Path.Auth;
  const isSd = location.pathname === Path.Sd;
  const isSdNew = location.pathname === Path.SdNew;

  const isMobileScreen = useMobileScreen();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerOffset, setDrawerOffset] = useState(0);
  const [isDrawerDragging, setIsDrawerDragging] = useState(false);
  const [isDrawerSettling, setIsDrawerSettling] = useState(false);
  const drawerTimer = useRef<number | null>(null);
  const suppressDrawerClick = useRef(false);
  const windowContentRef = useRef<HTMLDivElement>(null);
  const latestDrawerState = useRef({
    isOpen: false,
    offset: 0,
    pathname: Path.Chat as string,
  });
  const drawerGesture = useRef({
    touchId: -1,
    startX: 0,
    startY: 0,
    startOffset: 0,
    lastX: 0,
    lastTime: 0,
    velocityX: 0,
    offset: 0,
    maxDistance: 1,
    directionLocked: false,
    cancelled: false,
  });
  const shouldTightBorder =
    getClientConfig()?.isApp || (config.tightBorder && !isMobileScreen);

  useEffect(() => {
    latestDrawerState.current = {
      isOpen: isDrawerOpen,
      offset: drawerOffset,
      pathname: location.pathname,
    };
  });

  useEffect(() => {
    return () => {
      if (drawerTimer.current !== null) {
        window.clearTimeout(drawerTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMobileScreen) {
      setIsDrawerOpen(false);
      setDrawerOffset(0);
      setIsDrawerDragging(false);
      setIsDrawerSettling(false);
      return;
    }

    const maxDistance = getDrawerDistance();
    if (location.pathname === Path.Home) {
      setIsDrawerOpen(true);
      setDrawerOffset(maxDistance);
    } else if (location.pathname !== Path.Chat) {
      setIsDrawerOpen(false);
      setDrawerOffset(0);
    }
  }, [isMobileScreen, location.pathname]);

  const settleDrawer = (open: boolean) => {
    const maxDistance = getDrawerDistance();
    setIsDrawerOpen(open);
    setIsDrawerDragging(false);
    setIsDrawerSettling(true);
    setDrawerOffset(open ? maxDistance : 0);

    if (drawerTimer.current !== null) {
      window.clearTimeout(drawerTimer.current);
    }
    drawerTimer.current = window.setTimeout(() => {
      setIsDrawerSettling(false);
    }, 280);
  };

  useEffect(() => {
    const openMobileDrawer = () => {
      if (
        isMobileScreen &&
        (location.pathname === Path.Chat || location.pathname === Path.Home)
      ) {
        settleDrawer(true);
      }
    };

    window.addEventListener(MOBILE_DRAWER_EVENT, openMobileDrawer);
    return () =>
      window.removeEventListener(MOBILE_DRAWER_EVENT, openMobileDrawer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileScreen, location.pathname]);

  useEffect(() => {
    if (!isMobileScreen || !isDrawerOpen || isDrawerDragging) return;

    const syncOpenDrawerOffset = () => {
      setDrawerOffset(getDrawerDistance());
    };

    window.addEventListener("resize", syncOpenDrawerOffset);
    window.addEventListener("orientationchange", syncOpenDrawerOffset);
    return () => {
      window.removeEventListener("resize", syncOpenDrawerOffset);
      window.removeEventListener("orientationchange", syncOpenDrawerOffset);
    };
  }, [isMobileScreen, isDrawerOpen, isDrawerDragging]);

  useEffect(() => {
    if (!isMobileScreen) return;

    const element = windowContentRef.current;
    if (!element) return;

    const finishTouchGesture = (identifier: number, cancelled = false) => {
      const gesture = drawerGesture.current;
      if (gesture.touchId !== identifier) return;

      gesture.touchId = -1;

      if (gesture.directionLocked) {
        suppressDrawerClick.current = true;
        window.setTimeout(() => {
          suppressDrawerClick.current = false;
        }, 0);
      }

      if (cancelled || gesture.cancelled || !gesture.directionLocked) {
        setIsDrawerDragging(false);
        settleDrawer(latestDrawerState.current.isOpen);
        return;
      }

      const projectedOffset = projectDrawerOffset(
        gesture.offset,
        gesture.velocityX,
      );
      const shouldOpen =
        gesture.velocityX > DRAWER_VELOCITY_THRESHOLD ||
        (gesture.velocityX > -DRAWER_VELOCITY_THRESHOLD &&
          projectedOffset >= gesture.maxDistance * 0.5);

      settleDrawer(shouldOpen);
    };

    const onTouchStart = (event: TouchEvent) => {
      const state = latestDrawerState.current;
      if (
        event.touches.length !== 1 ||
        (state.pathname !== Path.Chat && state.pathname !== Path.Home) ||
        shouldIgnoreDrawerGesture(event.target)
      ) {
        return;
      }

      const touch = event.changedTouches.item(0);
      if (!touch) return;

      const maxDistance = getDrawerDistance();
      const startOffset = getPresentedDrawerOffset(
        element,
        maxDistance,
        state.isOpen ? maxDistance : state.offset,
      );

      drawerGesture.current = {
        touchId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        startOffset,
        lastX: touch.clientX,
        lastTime: performance.now(),
        velocityX: 0,
        offset: startOffset,
        maxDistance,
        directionLocked: false,
        cancelled: false,
      };
      setDrawerOffset(startOffset);
      setIsDrawerSettling(false);
    };

    const onTouchMove = (event: TouchEvent) => {
      const gesture = drawerGesture.current;
      if (gesture.touchId < 0 || gesture.cancelled) return;

      const touch = findTouch(event.touches, gesture.touchId);
      if (!touch) return;

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!gesture.directionLocked) {
        if (Math.max(absX, absY) < DRAWER_INTENT_THRESHOLD) return;

        const canMoveRight = gesture.startOffset < gesture.maxDistance - 1;
        const canMoveLeft = gesture.startOffset > 1;
        const isPossibleDrawerMove =
          (deltaX > 0 && canMoveRight) || (deltaX < 0 && canMoveLeft);

        if (!isPossibleDrawerMove || absX < absY * DRAWER_INTENT_RATIO) {
          gesture.cancelled = true;
          gesture.touchId = -1;
          setIsDrawerDragging(false);
          settleDrawer(latestDrawerState.current.isOpen);
          return;
        }

        gesture.directionLocked = true;
        setIsDrawerDragging(true);
      }

      event.preventDefault();
      const now = performance.now();
      const deltaTime = Math.max(1, now - gesture.lastTime);
      gesture.velocityX = ((touch.clientX - gesture.lastX) / deltaTime) * 1000;
      gesture.lastX = touch.clientX;
      gesture.lastTime = now;
      gesture.offset = clampDrawerOffset(
        gesture.startOffset + deltaX,
        gesture.maxDistance,
      );
      setDrawerOffset(gesture.offset);
    };

    const onTouchEnd = (event: TouchEvent) => {
      const gesture = drawerGesture.current;
      if (gesture.touchId < 0) return;

      const touch = findTouch(event.changedTouches, gesture.touchId);
      if (touch) finishTouchGesture(touch.identifier);
    };

    const onTouchCancel = (event: TouchEvent) => {
      const gesture = drawerGesture.current;
      if (gesture.touchId < 0) return;

      const touch = findTouch(event.changedTouches, gesture.touchId);
      if (touch) finishTouchGesture(touch.identifier, true);
    };

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", onTouchCancel);

    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileScreen, location.pathname]);

  const closeDrawer = () => {
    if (!isDrawerOpen) return;
    settleDrawer(false);
  };

  const handleDrawerClickCapture = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (!isMobileScreen || !isDrawerOpen) return;

    event.preventDefault();
    event.stopPropagation();
    if (!suppressDrawerClick.current) {
      closeDrawer();
    }
    suppressDrawerClick.current = false;
  };

  if (isArtifact) {
    return (
      <Routes>
        <Route path="/artifacts/:id" element={<Artifacts />} />
      </Routes>
    );
  }
  const renderContent = () => {
    if (isAuth) return <AuthPage />;
    if (isSd) return <Sd />;
    if (isSdNew) return <Sd />;
    return (
      <>
        <SideBar
          onMobileDismiss={() => {
            if (isMobileScreen) closeDrawer();
          }}
        />
        <WindowContent
          ref={windowContentRef}
          className={clsx({
            [styles["drawer-open"]]: isMobileScreen && drawerOffset > 0,
          })}
          style={
            isMobileScreen
              ? ({
                  "--drawer-offset": `${drawerOffset}px`,
                } as CSSProperties)
              : undefined
          }
          onClickCapture={handleDrawerClickCapture}
        >
          <Routes>
            <Route path={Path.Home} element={<Chat />} />
            <Route path={Path.NewChat} element={<NewChat />} />
            <Route path={Path.Masks} element={<MaskPage />} />
            <Route path={Path.Plugins} element={<PluginPage />} />
            <Route path={Path.SearchChat} element={<SearchChat />} />
            <Route path={Path.Chat} element={<Chat />} />
            <Route path={Path.Settings} element={<Settings />} />
            <Route path={Path.McpMarket} element={<McpMarketPage />} />
          </Routes>
        </WindowContent>
      </>
    );
  };

  return (
    <div
      className={clsx(styles.container, {
        [styles["tight-container"]]: shouldTightBorder,
        [styles["rtl-screen"]]: getLang() === "ar",
        [styles["drawer-dragging"]]: isDrawerDragging,
        [styles["drawer-settling"]]: isDrawerSettling,
      })}
    >
      {renderContent()}
    </div>
  );
}

export function useLoadData() {
  const config = useAppConfig();

  const api: ClientApi = getClientApi(config.modelConfig.providerName);

  useEffect(() => {
    (async () => {
      const models = await api.llm.models();
      config.mergeModels(models);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function Home() {
  useSwitchTheme();
  useLoadData();
  useHtmlLang();

  useEffect(() => {
    console.log("[Config] got config from build time", getClientConfig());
    useAccessStore.getState().fetch();

    const initMcp = async () => {
      try {
        const enabled = await isMcpEnabled();
        if (enabled) {
          console.log("[MCP] initializing...");
          await initializeMcpSystem();
          console.log("[MCP] initialized");
        }
      } catch (err) {
        console.error("[MCP] failed to initialize:", err);
      }
    };
    initMcp();
  }, []);

  if (!useHasHydrated()) {
    return <Loading />;
  }

  return (
    <ErrorBoundary>
      <Router>
        <Screen />
      </Router>
    </ErrorBoundary>
  );
}

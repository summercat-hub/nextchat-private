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
const DRAWER_VELOCITY_THRESHOLD = 500;
const DRAWER_MIN_COMMIT_DISTANCE = 52;
const DRAWER_COMMIT_DISTANCE_RATIO = 0.38;
const DRAWER_SETTLE_DURATION = 340;

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

function getGestureTargetElement(target: EventTarget | null) {
  if (target instanceof HTMLElement) return target;
  if (target instanceof SVGElement) return target.parentElement;
  return null;
}

function shouldIgnoreDrawerGesture(
  target: EventTarget | null,
  allowDrawerCloseGesture = false,
) {
  const targetElement = getGestureTargetElement(target);
  if (!targetElement) return true;
  if (isSelectionActive()) return true;

  const blockingSurface = targetElement.closest(
    ["[role='dialog']", "dialog", "[popover]", ".modal-mask", "iframe"].join(
      ",",
    ),
  );
  if (blockingSurface) return true;

  // When the drawer is already open, the visible chat surface acts as a
  // dismissible foreground layer. A left swipe should work from anywhere on
  // that layer, even if the finger starts over a button or the input area.
  if (allowDrawerCloseGesture) return false;

  const ignoredTarget = targetElement.closest(
    [
      "input",
      "textarea",
      "select",
      "button",
      "a",
      "[contenteditable]",
      "[data-horizontal-gesture-surface]",
      "code",
      "pre",
      "img",
      "video",
      "audio",
      "canvas",
    ].join(","),
  );

  return !!ignoredTarget || isHorizontallyScrollable(targetElement);
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

function getDrawerCommitDistance(
  startX: number,
  opening: boolean,
  maxDistance: number,
) {
  const availableDistance = opening
    ? Math.max(0, window.innerWidth - startX)
    : Math.max(0, startX);

  return Math.min(
    maxDistance * DRAWER_COMMIT_DISTANCE_RATIO,
    Math.max(
      DRAWER_MIN_COMMIT_DISTANCE,
      availableDistance * DRAWER_COMMIT_DISTANCE_RATIO,
    ),
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
  const containerRef = useRef<HTMLDivElement>(null);
  const windowContentRef = useRef<HTMLDivElement>(null);
  const latestDrawerState = useRef({
    isOpen: false,
    offset: 0,
    pathname: Path.Chat as string,
  });
  const drawerGesture = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    startOffset: 0,
    lastX: 0,
    lastTime: 0,
    velocityX: 0,
    offset: 0,
    maxDistance: 1,
    startedOpen: false,
    directionLocked: false,
    cancelled: false,
  });
  const shouldTightBorder =
    getClientConfig()?.isApp || (config.tightBorder && !isMobileScreen);
  const isDrawerVisible = isMobileScreen && drawerOffset > 0.5;

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
    }, DRAWER_SETTLE_DURATION);
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
    if (!isDrawerVisible) return;

    const element = windowContentRef.current;
    if (!element) return;

    const preventForegroundScroll = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };

    element.addEventListener("touchmove", preventForegroundScroll, {
      passive: false,
    });
    return () => {
      element.removeEventListener("touchmove", preventForegroundScroll);
    };
  }, [isDrawerVisible]);

  useEffect(() => {
    if (!isMobileScreen) return;

    const surface = containerRef.current;
    const element = windowContentRef.current;
    if (!surface || !element) return;

    const finishDrawerGesture = (identifier: number, cancelled = false) => {
      const gesture = drawerGesture.current;
      if (gesture.pointerId !== identifier) return;

      gesture.pointerId = -1;

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

      const opening = !gesture.startedOpen;
      const projectedOffset = clampDrawerOffset(
        projectDrawerOffset(gesture.offset, gesture.velocityX),
        gesture.maxDistance,
      );
      const directTravel = opening
        ? gesture.offset - gesture.startOffset
        : gesture.startOffset - gesture.offset;
      const projectedTravel = opening
        ? projectedOffset - gesture.startOffset
        : gesture.startOffset - projectedOffset;
      const directionalVelocity = opening
        ? gesture.velocityX
        : -gesture.velocityX;
      const requiredDistance = getDrawerCommitDistance(
        gesture.startX,
        opening,
        gesture.maxDistance,
      );

      const shouldChangeState =
        directionalVelocity > DRAWER_VELOCITY_THRESHOLD ||
        (directionalVelocity > -DRAWER_VELOCITY_THRESHOLD &&
          Math.max(directTravel, projectedTravel) >= requiredDistance);

      settleDrawer(
        gesture.startedOpen ? !shouldChangeState : shouldChangeState,
      );
    };

    const startDrawerGesture = (
      identifier: number,
      clientX: number,
      clientY: number,
      target: EventTarget | null,
    ) => {
      const state = latestDrawerState.current;
      const allowDrawerCloseGesture = state.isOpen;

      if (
        (state.pathname !== Path.Chat && state.pathname !== Path.Home) ||
        shouldIgnoreDrawerGesture(target, allowDrawerCloseGesture)
      ) {
        return false;
      }

      const maxDistance = getDrawerDistance();
      const startOffset = getPresentedDrawerOffset(
        element,
        maxDistance,
        state.isOpen ? maxDistance : state.offset,
      );

      drawerGesture.current = {
        pointerId: identifier,
        startX: clientX,
        startY: clientY,
        startOffset,
        lastX: clientX,
        lastTime: performance.now(),
        velocityX: 0,
        offset: startOffset,
        maxDistance,
        startedOpen: state.isOpen,
        directionLocked: false,
        cancelled: false,
      };
      setDrawerOffset(startOffset);
      setIsDrawerSettling(false);
      return true;
    };

    const moveDrawerGesture = (
      identifier: number,
      clientX: number,
      clientY: number,
    ) => {
      const gesture = drawerGesture.current;
      if (gesture.pointerId !== identifier || gesture.cancelled) return false;

      const deltaX = clientX - gesture.startX;
      const deltaY = clientY - gesture.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!gesture.directionLocked) {
        if (Math.max(absX, absY) < DRAWER_INTENT_THRESHOLD) return false;

        const canMoveRight = gesture.startOffset < gesture.maxDistance - 1;
        const canMoveLeft = gesture.startOffset > 1;
        const isPossibleDrawerMove =
          (deltaX > 0 && canMoveRight) || (deltaX < 0 && canMoveLeft);

        if (!isPossibleDrawerMove || absX < absY * DRAWER_INTENT_RATIO) {
          gesture.cancelled = true;
          gesture.pointerId = -1;
          setIsDrawerDragging(false);
          settleDrawer(latestDrawerState.current.isOpen);
          return false;
        }

        gesture.directionLocked = true;
        setIsDrawerDragging(true);
      }

      const now = performance.now();
      const deltaTime = Math.max(1, now - gesture.lastTime);
      gesture.velocityX = ((clientX - gesture.lastX) / deltaTime) * 1000;
      gesture.lastX = clientX;
      gesture.lastTime = now;
      gesture.offset = clampDrawerOffset(
        gesture.startOffset + deltaX,
        gesture.maxDistance,
      );
      setDrawerOffset(gesture.offset);
      return true;
    };

    const supportsPointerEvents = "PointerEvent" in window;

    if (supportsPointerEvents) {
      const onPointerDown = (event: PointerEvent) => {
        if (
          !event.isPrimary ||
          (event.pointerType === "mouse" && event.button !== 0)
        ) {
          return;
        }

        startDrawerGesture(
          event.pointerId,
          event.clientX,
          event.clientY,
          event.target,
        );
      };

      const onPointerMove = (event: PointerEvent) => {
        const handled = moveDrawerGesture(
          event.pointerId,
          event.clientX,
          event.clientY,
        );
        if (handled) {
          if (!surface.hasPointerCapture(event.pointerId)) {
            try {
              surface.setPointerCapture(event.pointerId);
            } catch {
              // Older WebKit builds can reject capture during synthetic events.
            }
          }
          if (event.cancelable) event.preventDefault();
        }
      };

      const finishPointerGesture = (event: PointerEvent, cancelled = false) => {
        if (surface.hasPointerCapture(event.pointerId)) {
          surface.releasePointerCapture(event.pointerId);
        }
        finishDrawerGesture(event.pointerId, cancelled);
      };
      const onPointerCancel = (event: PointerEvent) =>
        finishPointerGesture(event, true);

      surface.addEventListener("pointerdown", onPointerDown, true);
      surface.addEventListener("pointermove", onPointerMove, {
        passive: false,
        capture: true,
      });
      surface.addEventListener("pointerup", finishPointerGesture, true);
      surface.addEventListener("pointercancel", onPointerCancel, true);

      return () => {
        surface.removeEventListener("pointerdown", onPointerDown, true);
        surface.removeEventListener("pointermove", onPointerMove, true);
        surface.removeEventListener("pointerup", finishPointerGesture, true);
        surface.removeEventListener("pointercancel", onPointerCancel, true);
      };
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.changedTouches.item(0);
      if (!touch) return;
      startDrawerGesture(
        touch.identifier,
        touch.clientX,
        touch.clientY,
        event.target,
      );
    };

    const onTouchMove = (event: TouchEvent) => {
      const gesture = drawerGesture.current;
      if (gesture.pointerId < 0) return;
      const touch = findTouch(event.touches, gesture.pointerId);
      if (!touch) return;
      const handled = moveDrawerGesture(
        touch.identifier,
        touch.clientX,
        touch.clientY,
      );
      if (handled && event.cancelable) event.preventDefault();
    };

    const onTouchEnd = (event: TouchEvent) => {
      const gesture = drawerGesture.current;
      if (gesture.pointerId < 0) return;
      const touch = findTouch(event.changedTouches, gesture.pointerId);
      if (touch) finishDrawerGesture(touch.identifier);
    };

    const onTouchCancel = (event: TouchEvent) => {
      const gesture = drawerGesture.current;
      if (gesture.pointerId < 0) return;
      const touch = findTouch(event.changedTouches, gesture.pointerId);
      if (touch) finishDrawerGesture(touch.identifier, true);
    };

    surface.addEventListener("touchstart", onTouchStart, { passive: true });
    surface.addEventListener("touchmove", onTouchMove, { passive: false });
    surface.addEventListener("touchend", onTouchEnd);
    surface.addEventListener("touchcancel", onTouchCancel);

    return () => {
      surface.removeEventListener("touchstart", onTouchStart);
      surface.removeEventListener("touchmove", onTouchMove);
      surface.removeEventListener("touchend", onTouchEnd);
      surface.removeEventListener("touchcancel", onTouchCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileScreen, location.pathname]);

  const drawerDistance =
    isMobileScreen && typeof window !== "undefined" ? getDrawerDistance() : 1;
  const drawerProgress = isMobileScreen
    ? clampDrawerOffset(drawerOffset, drawerDistance) / drawerDistance
    : 0;
  const drawerInverseProgress = 1 - drawerProgress;

  const closeDrawer = () => {
    if (!isDrawerOpen) return;
    settleDrawer(false);
  };

  const handleContainerClickCapture = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (!isMobileScreen || !suppressDrawerClick.current) return;

    event.preventDefault();
    event.stopPropagation();
    suppressDrawerClick.current = false;
  };

  const handleDrawerClickCapture = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (!isMobileScreen || !isDrawerOpen) return;

    event.preventDefault();
    event.stopPropagation();
    closeDrawer();
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
          onClickCapture={handleDrawerClickCapture}
        >
          <Routes>
            <Route path={Path.Home} element={<Chat />} />
            <Route path={Path.NewChat} element={<NewChat />} />
            <Route path={Path.Masks} element={<Chat />} />
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
      ref={containerRef}
      className={clsx(styles.container, {
        [styles["tight-container"]]: shouldTightBorder,
        [styles["rtl-screen"]]: getLang() === "ar",
        [styles["drawer-dragging"]]: isDrawerDragging,
        [styles["drawer-settling"]]: isDrawerSettling,
      })}
      style={
        isMobileScreen
          ? ({
              "--drawer-offset": `${drawerOffset}px`,
              "--drawer-progress": drawerProgress.toFixed(4),
              "--drawer-inverse-progress": drawerInverseProgress.toFixed(4),
            } as CSSProperties)
          : undefined
      }
      onClickCapture={handleContainerClickCapture}
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

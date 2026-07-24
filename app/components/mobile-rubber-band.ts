import { type RefObject, useEffect, useRef } from "react";

const INTENT_THRESHOLD = 8;
const INTENT_RATIO = 1.15;
const MAX_OFFSET = 72;

function shouldUseNativeIOSOverscroll() {
  const userAgent = navigator.userAgent;
  const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent);
  const isIPadOS =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIOSDevice || isIPadOS;
}

function findTouch(touches: TouchList, identifier: number) {
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches.item(index);
    if (touch?.identifier === identifier) return touch;
  }
}

function getTranslateY(element: HTMLElement) {
  const transform = window.getComputedStyle(element).transform;
  if (!transform || transform === "none") return 0;

  try {
    return new DOMMatrixReadOnly(transform).m42;
  } catch {
    const matrixValues = transform.match(/matrix.*\((.+)\)/)?.[1]?.split(",");
    const translateY = matrixValues ? Number(matrixValues[5]) : NaN;
    return Number.isFinite(translateY) ? translateY : 0;
  }
}

function rubberBand(distance: number, dimension: number) {
  const constant = 0.45;
  return (
    (distance * dimension * constant) /
    (dimension + constant * Math.abs(distance))
  );
}

export function useMobileRubberBandScroll<
  ScrollElement extends HTMLElement,
  ContentElement extends HTMLElement,
>(scrollRef: RefObject<ScrollElement>, contentRef: RefObject<ContentElement>) {
  const animationRef = useRef<Animation | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    const contentElement = contentRef.current;
    if (!scrollElement || !contentElement) return;

    const mobileQuery = window.matchMedia(
      "(max-width: 640px) and (pointer: coarse)",
    );
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    if (shouldUseNativeIOSOverscroll()) {
      const previousOverscrollBehavior =
        scrollElement.style.overscrollBehaviorY;
      const previousMomentumScrolling = scrollElement.style.getPropertyValue(
        "-webkit-overflow-scrolling",
      );

      contentElement.style.transform = "";
      scrollElement.style.overscrollBehaviorY = "auto";
      scrollElement.style.setProperty("-webkit-overflow-scrolling", "touch");

      return () => {
        scrollElement.style.overscrollBehaviorY = previousOverscrollBehavior;
        if (previousMomentumScrolling) {
          scrollElement.style.setProperty(
            "-webkit-overflow-scrolling",
            previousMomentumScrolling,
          );
        } else {
          scrollElement.style.removeProperty("-webkit-overflow-scrolling");
        }
      };
    }

    let gesture = {
      identifier: -1,
      startX: 0,
      startY: 0,
      anchorY: 0,
      lastY: 0,
      intent: "pending" as "pending" | "horizontal" | "vertical",
      boundary: null as "top" | "bottom" | null,
    };

    const setOffset = (offset: number) => {
      offsetRef.current = offset;
      contentElement.style.transform = `translate3d(0, ${offset}px, 0)`;
    };

    const stopAnimationAtPresentedValue = () => {
      const animation = animationRef.current;
      if (!animation) return;

      const presentedOffset = getTranslateY(contentElement);
      animation.cancel();
      animationRef.current = null;
      setOffset(presentedOffset);
    };

    const resetGesture = () => {
      gesture = {
        identifier: -1,
        startX: 0,
        startY: 0,
        anchorY: 0,
        lastY: 0,
        intent: "pending",
        boundary: null,
      };
    };

    const settle = () => {
      const offset = offsetRef.current;
      resetGesture();

      if (Math.abs(offset) < 0.5 || reducedMotionQuery.matches) {
        setOffset(0);
        contentElement.style.willChange = "";
        return;
      }

      contentElement.style.willChange = "transform";
      if (typeof contentElement.animate !== "function") {
        setOffset(0);
        contentElement.style.willChange = "";
        return;
      }

      const animation = contentElement.animate(
        [
          { transform: `translate3d(0, ${offset}px, 0)` },
          {
            transform: `translate3d(0, ${-offset * 0.035}px, 0)`,
            offset: 0.78,
          },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: 520,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        },
      );

      animationRef.current = animation;
      animation.onfinish = () => {
        animationRef.current = null;
        setOffset(0);
        contentElement.style.willChange = "";
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!mobileQuery.matches || event.touches.length !== 1) return;

      stopAnimationAtPresentedValue();
      const touch = event.touches[0];
      gesture = {
        identifier: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        anchorY: touch.clientY,
        lastY: touch.clientY,
        intent: "pending",
        boundary: null,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!mobileQuery.matches || gesture.identifier < 0) return;

      const touch = findTouch(event.touches, gesture.identifier);
      if (!touch) return;

      const distanceX = touch.clientX - gesture.startX;
      const distanceY = touch.clientY - gesture.startY;

      if (gesture.intent === "pending") {
        if (
          Math.max(Math.abs(distanceX), Math.abs(distanceY)) < INTENT_THRESHOLD
        ) {
          return;
        }

        gesture.intent =
          Math.abs(distanceY) > Math.abs(distanceX) * INTENT_RATIO
            ? "vertical"
            : "horizontal";
      }

      if (gesture.intent !== "vertical") return;

      const stepY = touch.clientY - gesture.lastY;
      const atTop = scrollElement.scrollTop <= 0;
      const atBottom =
        scrollElement.scrollTop + scrollElement.clientHeight >=
        scrollElement.scrollHeight - 1;

      if (!gesture.boundary) {
        if (atTop && stepY > 0) {
          gesture.boundary = "top";
          gesture.anchorY = gesture.lastY;
        } else if (atBottom && stepY < 0) {
          gesture.boundary = "bottom";
          gesture.anchorY = gesture.lastY;
        } else {
          gesture.lastY = touch.clientY;
          return;
        }
      }

      const rawOffset = touch.clientY - gesture.anchorY;
      const crossedBackIntoContent =
        (gesture.boundary === "top" && rawOffset <= 0) ||
        (gesture.boundary === "bottom" && rawOffset >= 0);

      if (crossedBackIntoContent) {
        setOffset(0);
        gesture.boundary = null;
        gesture.startX = touch.clientX;
        gesture.startY = touch.clientY;
        gesture.anchorY = touch.clientY;
        gesture.lastY = touch.clientY;
        gesture.intent = "pending";
        return;
      }

      event.preventDefault();
      contentElement.style.willChange = "transform";
      const dimension = Math.min(
        Math.max(scrollElement.clientHeight, 120),
        260,
      );
      const offset = Math.max(
        -MAX_OFFSET,
        Math.min(MAX_OFFSET, rubberBand(rawOffset, dimension)),
      );
      setOffset(offset);
      gesture.lastY = touch.clientY;
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (gesture.identifier < 0) return;
      if (findTouch(event.touches, gesture.identifier)) return;
      settle();
    };

    const onMediaChange = () => {
      if (!mobileQuery.matches) {
        animationRef.current?.cancel();
        animationRef.current = null;
        setOffset(0);
        contentElement.style.willChange = "";
        resetGesture();
      }
    };

    scrollElement.addEventListener("touchstart", onTouchStart, {
      passive: true,
    });
    scrollElement.addEventListener("touchmove", onTouchMove, {
      passive: false,
    });
    scrollElement.addEventListener("touchend", onTouchEnd, { passive: true });
    scrollElement.addEventListener("touchcancel", onTouchEnd, {
      passive: true,
    });
    mobileQuery.addEventListener?.("change", onMediaChange);

    return () => {
      animationRef.current?.cancel();
      animationRef.current = null;
      setOffset(0);
      contentElement.style.willChange = "";
      scrollElement.removeEventListener("touchstart", onTouchStart);
      scrollElement.removeEventListener("touchmove", onTouchMove);
      scrollElement.removeEventListener("touchend", onTouchEnd);
      scrollElement.removeEventListener("touchcancel", onTouchEnd);
      mobileQuery.removeEventListener?.("change", onMediaChange);
    };
  }, [contentRef, scrollRef]);
}

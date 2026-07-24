import { type RefObject, useEffect, useRef } from "react";

const INTENT_THRESHOLD = 8;
const INTENT_RATIO = 1.15;
const MAX_OFFSET = 56;

function findTouch(touches: TouchList, identifier: number) {
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches.item(index);
    if (touch?.identifier === identifier) return touch;
  }
}

function getTranslateX(element: HTMLElement) {
  const transform = window.getComputedStyle(element).transform;
  if (!transform || transform === "none") return 0;

  try {
    return new DOMMatrixReadOnly(transform).m41;
  } catch {
    const matrixValues = transform.match(/matrix.*\((.+)\)/)?.[1]?.split(",");
    const translateX = matrixValues ? Number(matrixValues[4]) : NaN;
    return Number.isFinite(translateX) ? translateX : 0;
  }
}

function rubberBand(distance: number, dimension: number) {
  const constant = 0.45;
  return (
    (distance * dimension * constant) /
    (dimension + constant * Math.abs(distance))
  );
}

export function useMobileHorizontalRubberBandScroll<
  ScrollElement extends HTMLElement,
  ContentElement extends HTMLElement,
>(
  scrollRef: RefObject<ScrollElement>,
  contentRef: RefObject<ContentElement>,
  enabled = true,
) {
  const animationRef = useRef<Animation | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const scrollElement = scrollRef.current;
    const contentElement = contentRef.current;
    if (!scrollElement || !contentElement) return;

    const mobileQuery = window.matchMedia(
      "(max-width: 640px) and (pointer: coarse)",
    );
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    let gesture = {
      identifier: -1,
      startX: 0,
      startY: 0,
      anchorX: 0,
      lastX: 0,
      intent: "pending" as "pending" | "horizontal" | "vertical",
      boundary: null as "left" | "right" | null,
    };

    const setOffset = (offset: number) => {
      offsetRef.current = offset;
      contentElement.style.transform = `translate3d(${offset}px, 0, 0)`;
    };

    const stopAnimationAtPresentedValue = () => {
      const animation = animationRef.current;
      if (!animation) return;

      const presentedOffset = getTranslateX(contentElement);
      animation.cancel();
      animationRef.current = null;
      setOffset(presentedOffset);
    };

    const resetGesture = () => {
      gesture = {
        identifier: -1,
        startX: 0,
        startY: 0,
        anchorX: 0,
        lastX: 0,
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
          { transform: `translate3d(${offset}px, 0, 0)` },
          {
            transform: `translate3d(${-offset * 0.055}px, 0, 0)`,
            offset: 0.72,
          },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: 340,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
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
        anchorX: touch.clientX,
        lastX: touch.clientX,
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
          Math.abs(distanceX) > Math.abs(distanceY) * INTENT_RATIO
            ? "horizontal"
            : "vertical";
      }

      if (gesture.intent !== "horizontal") return;

      const stepX = touch.clientX - gesture.lastX;
      const maxScroll = Math.max(
        0,
        scrollElement.scrollWidth - scrollElement.clientWidth,
      );
      const atLeft = scrollElement.scrollLeft <= 0;
      const atRight = scrollElement.scrollLeft >= maxScroll - 1;

      if (!gesture.boundary) {
        if (atLeft && stepX > 0) {
          gesture.boundary = "left";
          gesture.anchorX = gesture.lastX;
        } else if (atRight && stepX < 0) {
          gesture.boundary = "right";
          gesture.anchorX = gesture.lastX;
        } else {
          gesture.lastX = touch.clientX;
          return;
        }
      }

      const rawOffset = touch.clientX - gesture.anchorX;
      const crossedBackIntoContent =
        (gesture.boundary === "left" && rawOffset <= 0) ||
        (gesture.boundary === "right" && rawOffset >= 0);

      if (crossedBackIntoContent) {
        setOffset(0);
        gesture.boundary = null;
        gesture.startX = touch.clientX;
        gesture.startY = touch.clientY;
        gesture.anchorX = touch.clientX;
        gesture.lastX = touch.clientX;
        gesture.intent = "pending";
        return;
      }

      event.preventDefault();
      contentElement.style.willChange = "transform";
      const dimension = Math.min(Math.max(scrollElement.clientWidth, 160), 360);
      const offset = Math.max(
        -MAX_OFFSET,
        Math.min(MAX_OFFSET, rubberBand(rawOffset, dimension)),
      );
      setOffset(offset);
      gesture.lastX = touch.clientX;
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
  }, [contentRef, enabled, scrollRef]);
}

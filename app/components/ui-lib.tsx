/* eslint-disable @next/next/no-img-element */
import styles from "./ui-lib.module.scss";
import LoadingIcon from "../icons/three-dots.svg";
import CloseIcon from "../icons/close.svg";
import EyeIcon from "../icons/eye.svg";
import EyeOffIcon from "../icons/eye-off.svg";
import DownIcon from "../icons/down.svg";
import ConfirmIcon from "../icons/confirm.svg";
import CancelIcon from "../icons/cancel.svg";
import MaxIcon from "../icons/max.svg";
import MinIcon from "../icons/min.svg";

import Locale from "../locales";

import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import React, {
  CSSProperties,
  HTMLProps,
  MouseEvent,
  useEffect,
  useState,
  useCallback,
  useId,
  useRef,
} from "react";
import { IconButton } from "./button";
import { Avatar } from "./emoji";
import clsx from "clsx";
import { useMobileScreen } from "../utils";

export function BodyPortal(props: {
  children: React.ReactNode;
  className?: string;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const div = document.createElement("div");
    if (props.className) {
      div.className = props.className;
    }
    document.body.appendChild(div);
    setContainer(div);

    return () => {
      div.remove();
    };
  }, [props.className]);

  return container ? createPortal(props.children, container) : null;
}

export function Popover(props: {
  children: JSX.Element;
  content: JSX.Element;
  open?: boolean;
  onClose?: () => void;
  className?: string;
  contentClassName?: string;
  maskClassName?: string;
  contentRole?: React.AriaRole;
  ariaLabel?: string;
}) {
  const { open, onClose } = props;
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current =
      document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      contentRef.current
        ?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [open, onClose]);

  return (
    <div className={clsx(styles.popover, props.className)}>
      {props.children}
      {open && (
        <div
          className={clsx(styles["popover-mask"], props.maskClassName)}
          onClick={onClose}
        ></div>
      )}
      {open && (
        <div
          ref={contentRef}
          className={clsx(styles["popover-content"], props.contentClassName)}
          role={props.contentRole}
          aria-label={props.ariaLabel}
        >
          {props.content}
        </div>
      )}
    </div>
  );
}

export function Card(props: { children: JSX.Element[]; className?: string }) {
  return (
    <div className={clsx(styles.card, props.className)}>{props.children}</div>
  );
}

export function ListItem(props: {
  title?: string;
  subTitle?: string | JSX.Element;
  children?: JSX.Element | JSX.Element[];
  icon?: JSX.Element;
  className?: string;
  onClick?: (e: MouseEvent) => void;
  vertical?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={clsx(
        styles["list-item"],
        {
          [styles["vertical"]]: props.vertical,
          [styles["list-item-interactive"]]: !!props.onClick,
          [styles["list-item-disabled"]]: props.disabled,
        },
        props.className,
      )}
      onClick={props.onClick}
      role={props.onClick ? "button" : undefined}
      tabIndex={props.onClick && !props.disabled ? 0 : undefined}
      aria-disabled={props.disabled || undefined}
      onKeyDown={(event) => {
        if (!props.onClick || props.disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
    >
      <div className={styles["list-header"]}>
        {props.icon && <div className={styles["list-icon"]}>{props.icon}</div>}
        <div className={styles["list-item-title"]}>
          <div>{props.title}</div>
          {props.subTitle && (
            <div className={styles["list-item-sub-title"]}>
              {props.subTitle}
            </div>
          )}
        </div>
      </div>
      {props.children}
    </div>
  );
}

export function List(props: { children: React.ReactNode; id?: string }) {
  return (
    <div className={styles.list} id={props.id}>
      {props.children}
    </div>
  );
}

export function Loading() {
  return (
    <div
      style={{
        height: "var(--full-height)",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LoadingIcon />
    </div>
  );
}

interface ModalProps {
  title: string;
  children?: any;
  actions?: React.ReactNode[];
  defaultMax?: boolean;
  footer?: React.ReactNode;
  onClose?: () => void;
  centered?: boolean;
  showClose?: boolean;
  showMaximize?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  style?: CSSProperties;
}
export function Modal(props: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onClose = props.onClose;
  const onCloseRef = useRef(onClose);
  const isCentered = !!props.centered;
  const showClose = props.showClose !== false;
  const showMaximize = props.showMaximize !== false;
  const closeOnEscape = props.closeOnEscape !== false;
  const isMobileScreen = useMobileScreen();
  const [sheetOffset, setSheetOffset] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const sheetOffsetRef = useRef(0);
  const sheetAnimationFrame = useRef<number | null>(null);
  const sheetGesture = useRef({
    pointerId: -1,
    startY: 0,
    startOffset: 0,
    lastY: 0,
    lastTime: 0,
    velocityY: 0,
    samples: [] as Array<{ y: number; time: number }>,
  });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const updateSheetOffset = useCallback((nextOffset: number) => {
    sheetOffsetRef.current = nextOffset;
    setSheetOffset(nextOffset);

    const modal = modalRef.current;
    const mask = modal?.parentElement;
    if (modal && mask?.classList.contains("modal-mask")) {
      const progress = Math.min(
        1,
        Math.max(
          0,
          nextOffset / Math.max(1, modal.getBoundingClientRect().height),
        ),
      );
      mask.style.setProperty("--sheet-scrim-visibility", String(1 - progress));
    }
  }, []);

  const cancelSheetAnimation = useCallback(() => {
    if (sheetAnimationFrame.current !== null) {
      window.cancelAnimationFrame(sheetAnimationFrame.current);
      sheetAnimationFrame.current = null;
    }
  }, []);

  const animateSheetTo = useCallback(
    (target: number, initialVelocity: number, onComplete?: () => void) => {
      cancelSheetAnimation();

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        updateSheetOffset(target);
        onComplete?.();
        return;
      }

      let position = sheetOffsetRef.current;
      let velocity = initialVelocity;
      let lastTime = performance.now();
      const omega = 18;
      const dampingRatio = Math.abs(initialVelocity) > 900 ? 0.86 : 1;

      const tick = (now: number) => {
        const delta = Math.min(0.032, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;
        const acceleration =
          -2 * dampingRatio * omega * velocity -
          omega * omega * (position - target);
        velocity += acceleration * delta;
        position += velocity * delta;
        updateSheetOffset(position);

        if (Math.abs(velocity) < 5 && Math.abs(position - target) < 0.5) {
          updateSheetOffset(target);
          sheetAnimationFrame.current = null;
          onComplete?.();
          return;
        }

        sheetAnimationFrame.current = window.requestAnimationFrame(tick);
      };

      sheetAnimationFrame.current = window.requestAnimationFrame(tick);
    },
    [cancelSheetAnimation, updateSheetOffset],
  );

  const startSheetDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!isMobileScreen || isCentered || event.button !== 0) return;

      const target = event.target as HTMLElement;
      if (
        target.closest(`.${styles["modal-header-action"]}`) ||
        target.closest("input, select, textarea, a")
      ) {
        return;
      }

      cancelSheetAnimation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const now = performance.now();
      sheetGesture.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startOffset: sheetOffsetRef.current,
        lastY: event.clientY,
        lastTime: now,
        velocityY: 0,
        samples: [{ y: event.clientY, time: now }],
      };
      setIsSheetDragging(true);
    },
    [cancelSheetAnimation, isCentered, isMobileScreen],
  );

  const moveSheetDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const gesture = sheetGesture.current;
      if (gesture.pointerId !== event.pointerId) return;

      const now = performance.now();
      const deltaTime = Math.max(1, now - gesture.lastTime);
      gesture.samples.push({ y: event.clientY, time: now });
      gesture.samples = gesture.samples.filter(
        (sample) => now - sample.time <= 90,
      );
      const firstSample = gesture.samples[0];
      gesture.velocityY = firstSample
        ? ((event.clientY - firstSample.y) /
            Math.max(1, now - firstSample.time)) *
          1000
        : ((event.clientY - gesture.lastY) / deltaTime) * 1000;
      gesture.lastY = event.clientY;
      gesture.lastTime = now;

      const nextOffset = gesture.startOffset + event.clientY - gesture.startY;
      if (nextOffset >= 0) {
        event.preventDefault();
        updateSheetOffset(nextOffset);
      } else {
        const dimension =
          modalRef.current?.getBoundingClientRect().height ?? 600;
        const overshoot = Math.abs(nextOffset);
        const resistance =
          (overshoot * dimension * 0.5) / (dimension + 0.5 * overshoot);
        updateSheetOffset(-resistance);
      }
    },
    [updateSheetOffset],
  );

  const settleSheetDrag = useCallback(
    (cancelled = false) => {
      const gesture = sheetGesture.current;
      gesture.pointerId = -1;
      setIsSheetDragging(false);

      const modalHeight =
        modalRef.current?.getBoundingClientRect().height ?? 600;
      const projectedOffset =
        sheetOffsetRef.current +
        (gesture.velocityY / 1000) * (0.99 / (1 - 0.99));
      const shouldClose =
        !cancelled &&
        (projectedOffset > Math.min(170, modalHeight * 0.28) ||
          (gesture.velocityY > 850 && sheetOffsetRef.current > 36));

      if (shouldClose) {
        animateSheetTo(
          modalHeight + 24,
          gesture.velocityY,
          () => onCloseRef.current?.(),
        );
      } else {
        animateSheetTo(0, gesture.velocityY);
      }
    },
    [animateSheetTo],
  );

  const finishSheetDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, cancelled = false) => {
      const gesture = sheetGesture.current;
      if (gesture.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      settleSheetDrag(cancelled);
    },
    [settleSheetDrag],
  );

  useEffect(() => {
    if (!isMobileScreen || isCentered) return;

    const modal = modalRef.current;
    const content = modal?.querySelector<HTMLElement>(
      `.${styles["modal-content"]}`,
    );
    if (!modal || !content) return;

    let isCandidate = false;
    let isDraggingContent = false;
    let startX = 0;
    let startY = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(`.${styles["modal-header"]}`) ||
        target.closest(`.${styles["modal-grabber"]}`) ||
        target.closest("button, input, select, textarea, a") ||
        content.scrollTop > 0
      ) {
        return;
      }

      const touch = event.touches[0];
      const now = performance.now();
      startX = touch.clientX;
      startY = touch.clientY;
      isCandidate = true;
      isDraggingContent = false;
      sheetGesture.current = {
        pointerId: -2,
        startY: touch.clientY,
        startOffset: sheetOffsetRef.current,
        lastY: touch.clientY,
        lastTime: now,
        velocityY: 0,
        samples: [{ y: touch.clientY, time: now }],
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!isCandidate || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (!isDraggingContent) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 10) return;
        if (deltaY <= 0 || Math.abs(deltaX) > deltaY * 0.8) {
          isCandidate = false;
          return;
        }
        if (content.scrollTop > 0) {
          isCandidate = false;
          return;
        }
        isDraggingContent = true;
        setIsSheetDragging(true);
      }

      event.preventDefault();
      const now = performance.now();
      const gesture = sheetGesture.current;
      const deltaTime = Math.max(1, now - gesture.lastTime);
      gesture.velocityY = ((touch.clientY - gesture.lastY) / deltaTime) * 1000;
      gesture.lastY = touch.clientY;
      gesture.lastTime = now;
      updateSheetOffset(deltaY);
    };

    const onTouchEnd = () => {
      if (isDraggingContent) {
        settleSheetDrag(false);
      }
      isCandidate = false;
      isDraggingContent = false;
    };

    const onTouchCancel = () => {
      if (isDraggingContent) {
        settleSheetDrag(true);
      }
      isCandidate = false;
      isDraggingContent = false;
    };

    modal.addEventListener("touchstart", onTouchStart, { passive: true });
    modal.addEventListener("touchmove", onTouchMove, { passive: false });
    modal.addEventListener("touchend", onTouchEnd);
    modal.addEventListener("touchcancel", onTouchCancel);

    return () => {
      modal.removeEventListener("touchstart", onTouchStart);
      modal.removeEventListener("touchmove", onTouchMove);
      modal.removeEventListener("touchend", onTouchEnd);
      modal.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [isCentered, isMobileScreen, settleSheetDrag, updateSheetOffset]);

  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    const focusableSelector =
      'button:not([disabled]):not([tabindex="-1"]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusInitialElement = () => {
      const preferredFocus =
        modal?.querySelector<HTMLElement>("[data-autofocus]") ?? modal;
      preferredFocus?.focus({ preventScroll: true });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (closeOnEscape) onCloseRef.current?.();
        return;
      }

      if (e.key !== "Tab" || !modal) return;

      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusable.length === 0) {
        e.preventDefault();
        modal.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    requestAnimationFrame(focusInitialElement);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelSheetAnimation();
      modal?.parentElement?.style.removeProperty("--sheet-scrim-visibility");
      previousActiveElement?.focus();
    };
  }, [cancelSheetAnimation, closeOnEscape]);

  const [isMax, setMax] = useState(!!props.defaultMax);

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={clsx(styles["modal-container"], props.className, {
        [styles["modal-container-max"]]: isMax,
        [styles["modal-container-dragging"]]: isSheetDragging,
        [styles["modal-container-centered"]]: isCentered,
      })}
      style={
        isMobileScreen
          ? ({
              ...props.style,
              "--sheet-offset": `${sheetOffset}px`,
              "--sheet-opacity": `${Math.max(0.72, 1 - sheetOffset / 1200)}`,
            } as CSSProperties)
          : props.style
      }
    >
      {isMobileScreen && !isCentered && (
        <div
          className={styles["modal-grabber"]}
          aria-hidden="true"
          onPointerDown={startSheetDrag}
          onPointerMove={moveSheetDrag}
          onPointerUp={(event) => finishSheetDrag(event)}
          onPointerCancel={(event) => finishSheetDrag(event, true)}
        />
      )}
      <div
        className={styles["modal-header"]}
        onPointerDown={startSheetDrag}
        onPointerMove={moveSheetDrag}
        onPointerUp={(event) => finishSheetDrag(event)}
        onPointerCancel={(event) => finishSheetDrag(event, true)}
      >
        <div id={titleId} className={styles["modal-title"]}>
          {props.title}
        </div>

        <div className={styles["modal-header-actions"]}>
          {!isMobileScreen && showMaximize && (
            <button
              type="button"
              className={clsx(
                styles["modal-header-action"],
                styles["modal-header-action-max"],
              )}
              aria-label={isMax ? "还原窗口" : "最大化窗口"}
              onClick={() => setMax(!isMax)}
            >
              {isMax ? <MinIcon /> : <MaxIcon />}
            </button>
          )}
          {showClose && (
            <button
              type="button"
              className={styles["modal-header-action"]}
              aria-label="关闭"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      <div className={styles["modal-content"]}>{props.children}</div>

      <div className={styles["modal-footer"]}>
        {props.footer}
        <div className={styles["modal-actions"]}>
          {props.actions?.map((action, i) => (
            <div key={i} className={styles["modal-action"]}>
              {action}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function showModal(props: ModalProps) {
  const div = document.createElement("div");
  div.className = "modal-mask";
  document.body.appendChild(div);

  const root = createRoot(div);
  const closeModal = () => {
    props.onClose?.();
    root.unmount();
    div.remove();
  };

  div.onclick = (e) => {
    if (e.target === div) {
      closeModal();
    }
  };

  root.render(<Modal {...props} onClose={closeModal}></Modal>);
}

export type ToastProps = {
  content: string;
  action?: {
    text: string;
    onClick: () => void;
  };
  onClose?: () => void;
};

export function Toast(props: ToastProps) {
  return (
    <div
      className={styles["toast-container"]}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={styles["toast-content"]}>
        <span>{props.content}</span>
        {props.action && (
          <button
            onClick={() => {
              props.action?.onClick?.();
              props.onClose?.();
            }}
            className={styles["toast-action"]}
          >
            {props.action.text}
          </button>
        )}
      </div>
    </div>
  );
}

export function showToast(
  content: string,
  action?: ToastProps["action"],
  delay = 3000,
) {
  const div = document.createElement("div");
  div.className = styles.show;
  document.body.appendChild(div);

  const root = createRoot(div);
  const close = () => {
    div.classList.add(styles.hide);

    setTimeout(() => {
      root.unmount();
      div.remove();
    }, 300);
  };

  setTimeout(() => {
    close();
  }, delay);

  root.render(<Toast content={content} action={action} onClose={close} />);
}

export type InputProps = React.HTMLProps<HTMLTextAreaElement> & {
  autoHeight?: boolean;
  rows?: number;
};

export function Input(props: InputProps) {
  return (
    <textarea
      {...props}
      className={clsx(styles["input"], props.className)}
    ></textarea>
  );
}

export function PasswordInput(
  props: HTMLProps<HTMLInputElement> & { aria?: string },
) {
  const [visible, setVisible] = useState(false);
  function changeVisibility() {
    setVisible(!visible);
  }

  return (
    <div className={"password-input-container"}>
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={"password-input"}
      />
      <IconButton
        aria={visible ? "隐藏密码" : props.aria ?? "显示密码"}
        icon={visible ? <EyeIcon /> : <EyeOffIcon />}
        onClick={changeVisibility}
        className={"password-eye"}
      />
    </div>
  );
}

export function Select(
  props: React.DetailedHTMLProps<
    React.SelectHTMLAttributes<HTMLSelectElement> & {
      align?: "left" | "center";
    },
    HTMLSelectElement
  >,
) {
  const { className, children, align, ...otherProps } = props;
  return (
    <div
      className={clsx(
        styles["select-with-icon"],
        {
          [styles["left-align-option"]]: align === "left",
        },
        className,
      )}
    >
      <select className={styles["select-with-icon-select"]} {...otherProps}>
        {children}
      </select>
      <DownIcon className={styles["select-with-icon-icon"]} />
    </div>
  );
}

export function showConfirm(content: any) {
  const div = document.createElement("div");
  div.className = "modal-mask";
  document.body.appendChild(div);

  const root = createRoot(div);
  const closeModal = () => {
    root.unmount();
    div.remove();
  };

  return new Promise<boolean>((resolve) => {
    root.render(
      <Modal
        title={Locale.UI.Confirm}
        actions={[
          <IconButton
            key="cancel"
            text={Locale.UI.Cancel}
            onClick={() => {
              resolve(false);
              closeModal();
            }}
            icon={<CancelIcon />}
            tabIndex={0}
            bordered
            shadow
          ></IconButton>,
          <IconButton
            key="confirm"
            text={Locale.UI.Confirm}
            type="primary"
            onClick={() => {
              resolve(true);
              closeModal();
            }}
            icon={<ConfirmIcon />}
            tabIndex={0}
            autoFocus
            bordered
            shadow
          ></IconButton>,
        ]}
        onClose={closeModal}
      >
        {content}
      </Modal>,
    );
  });
}

function PromptInput(props: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const [input, setInput] = useState(props.value);
  const onInput = (value: string) => {
    props.onChange(value);
    setInput(value);
  };

  return (
    <textarea
      className={styles["modal-input"]}
      autoFocus
      value={input}
      onInput={(e) => onInput(e.currentTarget.value)}
      rows={props.rows ?? 3}
    ></textarea>
  );
}

export function showPrompt(content: any, value = "", rows = 3) {
  const div = document.createElement("div");
  div.className = "modal-mask";
  document.body.appendChild(div);

  const root = createRoot(div);
  const closeModal = () => {
    root.unmount();
    div.remove();
  };

  return new Promise<string>((resolve) => {
    let userInput = value;

    root.render(
      <Modal
        title={content}
        actions={[
          <IconButton
            key="cancel"
            text={Locale.UI.Cancel}
            onClick={() => {
              closeModal();
            }}
            icon={<CancelIcon />}
            bordered
            shadow
            tabIndex={0}
          ></IconButton>,
          <IconButton
            key="confirm"
            text={Locale.UI.Confirm}
            type="primary"
            onClick={() => {
              resolve(userInput);
              closeModal();
            }}
            icon={<ConfirmIcon />}
            bordered
            shadow
            tabIndex={0}
          ></IconButton>,
        ]}
        onClose={closeModal}
      >
        <PromptInput
          onChange={(val) => (userInput = val)}
          value={value}
          rows={rows}
        ></PromptInput>
      </Modal>,
    );
  });
}

export function showImageModal(
  img: string,
  defaultMax?: boolean,
  style?: CSSProperties,
  boxStyle?: CSSProperties,
) {
  showModal({
    title: Locale.Export.Image.Modal,
    defaultMax: defaultMax,
    children: (
      <div style={{ display: "flex", justifyContent: "center", ...boxStyle }}>
        <img
          src={img}
          alt="preview"
          style={
            style ?? {
              maxWidth: "100%",
            }
          }
        ></img>
      </div>
    ),
  });
}

export function Selector<T>(props: {
  items: Array<{
    title: string;
    subTitle?: string;
    value: T;
    disable?: boolean;
  }>;
  defaultSelectedValue?: T[] | T;
  onSelection?: (selection: T[]) => void;
  onClose?: () => void;
  multiple?: boolean;
}) {
  const [selectedValues, setSelectedValues] = useState<T[]>(
    Array.isArray(props.defaultSelectedValue)
      ? props.defaultSelectedValue
      : props.defaultSelectedValue !== undefined
      ? [props.defaultSelectedValue]
      : [],
  );

  const handleSelection = (e: MouseEvent, value: T) => {
    if (props.multiple) {
      e.stopPropagation();
      const newSelectedValues = selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value];
      setSelectedValues(newSelectedValues);
      props.onSelection?.(newSelectedValues);
    } else {
      setSelectedValues([value]);
      props.onSelection?.([value]);
      props.onClose?.();
    }
  };

  return (
    <div className={styles["selector"]} onClick={() => props.onClose?.()}>
      <div className={styles["selector-content"]}>
        <List>
          {props.items.map((item, i) => {
            const selected = selectedValues.includes(item.value);
            return (
              <ListItem
                className={clsx(styles["selector-item"], {
                  [styles["selector-item-disabled"]]: item.disable,
                })}
                key={i}
                disabled={item.disable}
                title={item.title}
                subTitle={item.subTitle}
                icon={<Avatar model={item.value as string} />}
                onClick={(e) => {
                  if (item.disable) {
                    e.stopPropagation();
                  } else {
                    handleSelection(e, item.value);
                  }
                }}
              >
                {selected ? (
                  <div
                    style={{
                      height: 10,
                      width: 10,
                      backgroundColor: "var(--primary)",
                      borderRadius: 10,
                    }}
                  ></div>
                ) : (
                  <></>
                )}
              </ListItem>
            );
          })}
        </List>
      </div>
    </div>
  );
}
export function FullScreen(props: any) {
  const { children, right = 10, top = 10, ...rest } = props;
  const ref = useRef<HTMLDivElement>();
  const [fullScreen, setFullScreen] = useState(false);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      ref.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);
  useEffect(() => {
    const handleScreenChange = (e: any) => {
      if (e.target === ref.current) {
        setFullScreen(!!document.fullscreenElement);
      }
    };
    document.addEventListener("fullscreenchange", handleScreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleScreenChange);
    };
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }} {...rest}>
      <div style={{ position: "absolute", right, top }}>
        <IconButton
          icon={fullScreen ? <MinIcon /> : <MaxIcon />}
          onClick={toggleFullscreen}
          bordered
        />
      </div>
      {children}
    </div>
  );
}

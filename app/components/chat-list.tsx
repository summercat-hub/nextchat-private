import XIcon from "../icons/x.svg";

import styles from "./home.module.scss";
import {
  DragDropContext,
  Droppable,
  Draggable,
  OnDragEndResponder,
} from "@hello-pangea/dnd";

import { useChatStore } from "../store";

import Locale from "../locales";
import { useLocation, useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { MaskAvatar } from "./mask";
import { Mask } from "../store/mask";
import { useRef, useEffect } from "react";
import { showConfirm } from "./ui-lib";
import clsx from "clsx";

function formatSessionTime(timestamp: string | number) {
  const value = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfValue = new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
  );
  const dayDifference = Math.round(
    (startOfToday.getTime() - startOfValue.getTime()) / 86_400_000,
  );
  const time = value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (dayDifference === 0) return `今天 ${time}`;
  if (dayDifference === 1) return "昨天";
  if (value.getFullYear() === now.getFullYear()) {
    return `${value.getMonth() + 1}月${value.getDate()}日`;
  }
  return `${value.getFullYear()}年${
    value.getMonth() + 1
  }月${value.getDate()}日`;
}

export function ChatItem(props: {
  onClick?: () => void;
  onDelete?: () => void;
  title: string;
  count: number;
  time: string;
  selected: boolean;
  id: string;
  index: number;
  narrow?: boolean;
  mask: Mask;
}) {
  const draggableRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (props.selected && draggableRef.current) {
      draggableRef.current?.scrollIntoView({
        block: "center",
      });
    }
  }, [props.selected]);

  const { pathname: currentPath } = useLocation();
  return (
    <Draggable draggableId={`${props.id}`} index={props.index}>
      {(provided) => (
        <div
          className={clsx(styles["chat-item-wrapper"], {
            [styles["chat-item-wrapper-selected"]]: props.selected,
          })}
          ref={(ele) => {
            draggableRef.current = ele;
            provided.innerRef(ele);
          }}
          {...provided.draggableProps}
        >
          <button
            type="button"
            className={clsx(styles["chat-item"], {
              [styles["chat-item-selected"]]:
                props.selected &&
                (currentPath === Path.Chat || currentPath === Path.Home),
            })}
            onClick={props.onClick}
            onContextMenu={(event) => {
              event.preventDefault();
              props.onDelete?.();
            }}
            aria-current={props.selected ? "page" : undefined}
            aria-label={`${props.title}，${Locale.ChatItem.ChatItemCount(
              props.count,
            )}`}
            {...provided.dragHandleProps}
            title={`${props.title}\n${Locale.ChatItem.ChatItemCount(
              props.count,
            )}`}
          >
            {props.narrow ? (
              <div className={styles["chat-item-narrow"]}>
                <div className={clsx(styles["chat-item-avatar"], "no-dark")}>
                  <MaskAvatar
                    avatar={props.mask.avatar}
                    model={props.mask.modelConfig.model}
                  />
                </div>
                <div className={styles["chat-item-narrow-count"]}>
                  {props.count}
                </div>
              </div>
            ) : (
              <>
                <div className={styles["chat-item-title"]}>{props.title}</div>
                <div className={styles["chat-item-info"]}>
                  <div className={styles["chat-item-count"]}>
                    {Locale.ChatItem.ChatItemCount(props.count)}
                  </div>
                  <div className={styles["chat-item-date"]}>{props.time}</div>
                </div>
              </>
            )}
          </button>

          <button
            type="button"
            className={styles["chat-item-delete"]}
            aria-label={`删除会话：${props.title}`}
            onClick={(e) => {
              props.onDelete?.();
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <XIcon />
          </button>
        </div>
      )}
    </Draggable>
  );
}

export function ChatList(props: { narrow?: boolean }) {
  const [sessions, selectedIndex, selectSession, moveSession] = useChatStore(
    (state) => [
      state.sessions,
      state.currentSessionIndex,
      state.selectSession,
      state.moveSession,
    ],
  );
  const chatStore = useChatStore();
  const navigate = useNavigate();

  const onDragEnd: OnDragEndResponder = (result) => {
    const { destination, source } = result;
    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    moveSession(source.index, destination.index);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="chat-list">
        {(provided) => (
          <div
            className={styles["chat-list"]}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {sessions.map((item, i) => (
              <ChatItem
                title={item.topic}
                time={formatSessionTime(item.lastUpdate)}
                count={item.messages.length}
                key={item.id}
                id={item.id}
                index={i}
                selected={i === selectedIndex}
                onClick={() => {
                  navigate(Path.Chat);
                  selectSession(i);
                }}
                onDelete={async () => {
                  if (await showConfirm(Locale.Home.DeleteChat)) {
                    chatStore.deleteSession(i);
                  }
                }}
                narrow={props.narrow}
                mask={item.mask}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}

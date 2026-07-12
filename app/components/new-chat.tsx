import { Path } from "../constant";
import { IconButton } from "./button";
import styles from "./new-chat.module.scss";

import LeftIcon from "../icons/left.svg";
import LightningIcon from "../icons/lightning.svg";
import EyeIcon from "../icons/eye.svg";

import { useLocation, useNavigate } from "react-router-dom";
import { useMaskStore } from "../store/mask";
import Locale from "../locales";
import { useAppConfig, useChatStore } from "../store";
import { useCommand } from "../command";
import { showConfirm } from "./ui-lib";
import { BUILTIN_MASK_STORE } from "../masks";

export function NewChat() {
  const chatStore = useChatStore();
  const maskStore = useMaskStore();
  const navigate = useNavigate();
  const config = useAppConfig();
  const { state } = useLocation();

  const startChat = (maskId?: string) => {
    const mask = maskId
      ? maskStore.get(maskId) ?? BUILTIN_MASK_STORE.get(maskId)
      : undefined;

    setTimeout(() => {
      chatStore.newSession(mask);
      navigate(Path.Chat);
    }, 10);
  };

  useCommand({
    mask: (id) => {
      try {
        startChat(id);
      } catch {
        console.error("[New Chat] failed to create chat from mask id=", id);
      }
    },
  });

  return (
    <div className={styles["new-chat"]}>
      <div className={styles["new-chat-header"]}>
        <IconButton
          icon={<LeftIcon />}
          text={Locale.NewChat.Return}
          aria={Locale.NewChat.Return}
          onClick={() => navigate(Path.Home)}
        />
        {!state?.fromHome && (
          <IconButton
            text={Locale.NewChat.NotShow}
            aria={Locale.NewChat.NotShow}
            onClick={async () => {
              if (await showConfirm(Locale.NewChat.ConfirmNoShow)) {
                startChat();
                config.update(
                  (config) => (config.dontShowMaskSplashScreen = true),
                );
              }
            }}
          />
        )}
      </div>

      <main className={styles["new-chat-content"]}>
        <div className={styles["new-chat-symbol"]} aria-hidden="true">
          <LightningIcon />
        </div>
        <h1 className={styles.title}>{Locale.NewChat.Title}</h1>
        <p className={styles["sub-title"]}>{Locale.NewChat.SubTitle}</p>

        <div className={styles.actions}>
          <IconButton
            text={Locale.NewChat.Skip}
            onClick={() => startChat()}
            icon={<LightningIcon />}
            type="primary"
            shadow
            className={styles.primary}
          />
          <IconButton
            text={Locale.NewChat.More}
            onClick={() => navigate(Path.Masks)}
            icon={<EyeIcon />}
            bordered
            className={styles.secondary}
          />
        </div>
      </main>
    </div>
  );
}

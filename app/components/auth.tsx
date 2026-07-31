import styles from "./auth.module.scss";
import { IconButton } from "./button";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { useAccessStore } from "../store";
import Locale from "../locales";
import { getClientConfig } from "../config/client";
import { PasswordInput } from "./ui-lib";
import LeftIcon from "@/app/icons/left.svg";

export function AuthPage() {
  const navigate = useNavigate();
  const accessStore = useAccessStore();
  const goChat = () => navigate(Path.Chat);

  useEffect(() => {
    if (getClientConfig()?.isApp) {
      navigate(Path.Settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles["auth-page"]}>
      <div className={styles["auth-header"]}>
        <IconButton
          icon={<LeftIcon />}
          text={Locale.Auth.Return}
          onClick={() => navigate(Path.Home)}
        ></IconButton>
      </div>
      <main className={styles["auth-content"]}>
        <div className={styles["auth-brand"]} aria-hidden="true">
          O
        </div>
        <h1 className={styles["auth-title"]}>{Locale.Auth.Title}</h1>
        <p className={styles["auth-tips"]}>{Locale.Auth.Tips}</p>

        <div className={styles["auth-field"]}>
          <PasswordInput
            aria={Locale.Settings.ShowPassword}
            aria-label={Locale.Auth.Input}
            value={accessStore.accessCode}
            placeholder={Locale.Auth.Input}
            onChange={(e) => {
              accessStore.update(
                (access) => (access.accessCode = e.currentTarget.value),
              );
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && accessStore.accessCode.trim()) {
                goChat();
              }
            }}
          />
        </div>

        {!accessStore.hideUserApiKey ? (
          <details className={styles["auth-advanced"]}>
            <summary>高级选项</summary>
            <PasswordInput
              aria={Locale.Settings.ShowPassword}
              aria-label={Locale.Settings.Access.OpenAI.ApiKey.Placeholder}
              value={accessStore.openaiApiKey}
              placeholder={Locale.Settings.Access.OpenAI.ApiKey.Placeholder}
              onChange={(e) => {
                accessStore.update(
                  (access) => (access.openaiApiKey = e.currentTarget.value),
                );
              }}
            />
            <PasswordInput
              aria={Locale.Settings.ShowPassword}
              aria-label={Locale.Settings.Access.Google.ApiKey.Placeholder}
              value={accessStore.googleApiKey}
              placeholder={Locale.Settings.Access.Google.ApiKey.Placeholder}
              onChange={(e) => {
                accessStore.update(
                  (access) => (access.googleApiKey = e.currentTarget.value),
                );
              }}
            />
          </details>
        ) : null}

        <IconButton
          className={styles["auth-submit"]}
          text={Locale.Auth.Confirm}
          type="primary"
          disabled={!accessStore.accessCode.trim()}
          onClick={goChat}
        />
        <p className={styles["auth-privacy"]}>密码仅用于验证访问权限。</p>
      </main>
    </div>
  );
}

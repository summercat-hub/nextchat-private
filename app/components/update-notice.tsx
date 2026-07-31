"use client";

import { useEffect, useState } from "react";
import { safeLocalStorage } from "../utils";
import { IconButton } from "./button";
import { Modal } from "./ui-lib";
import styles from "./update-notice.module.scss";
import clsx from "clsx";

const UPDATE_NOTICE_STORAGE_KEY = "open-chat:update-notice:2026-07-31";

export function UpdateNotice() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const storage = safeLocalStorage();

    if (storage.getItem(UPDATE_NOTICE_STORAGE_KEY)) return;

    setIsVisible(true);
  }, []);

  if (!isVisible) return null;

  const closeNotice = () => {
    safeLocalStorage().setItem(UPDATE_NOTICE_STORAGE_KEY, "seen");
    setIsVisible(false);
  };

  return (
    <div className={clsx("modal-mask", styles["update-notice-mask"])}>
      <Modal
        title="Open Chat 的智能和速度现已全面提升啦！"
        titleClassName={styles["update-notice-title"]}
        onClose={closeNotice}
        centered
        showClose
        showMaximize={false}
        closeOnEscape
        actions={[
          <IconButton
            key="confirm"
            className={styles["update-notice-action"]}
            type="primary"
            text="继续"
            onClick={closeNotice}
          />,
        ]}
      >
        <div className={styles["update-notice-content"]}>
          <p className={styles["update-notice-lead"]}>现底层模型已进行更新，</p>

          <div className={styles["update-notice-details"]}>
            <p>
              <strong>智能程度：</strong>
              在低、中、高三档上，相比之前分别提升了约
              <strong>90%</strong>、<strong>110%</strong> 和{" "}
              <strong>70%</strong>
            </p>
            <p>
              <strong>回复速度：</strong>
              相比之前大幅提升约 <strong>3~4 倍</strong>
              ，几秒钟即可一次性给出完整回复
            </p>
          </div>

          <p className={styles["update-notice-closing"]}>敬请期待更多更新吧~</p>
        </div>
      </Modal>
    </div>
  );
}

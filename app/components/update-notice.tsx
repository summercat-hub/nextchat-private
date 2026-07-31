"use client";

import { useEffect, useState } from "react";
import { safeLocalStorage } from "../utils";
import { IconButton } from "./button";
import { Modal } from "./ui-lib";
import styles from "./update-notice.module.scss";

const UPDATE_NOTICE_STORAGE_KEY = "open-chat:update-notice:2026-07-31";

export function UpdateNotice() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const storage = safeLocalStorage();

    if (storage.getItem(UPDATE_NOTICE_STORAGE_KEY)) return;

    // Mark it before rendering so a refresh during the same visit cannot show
    // the announcement twice.
    storage.setItem(UPDATE_NOTICE_STORAGE_KEY, "seen");
    setIsVisible(true);
  }, []);

  if (!isVisible) return null;

  const closeNotice = () => setIsVisible(false);

  return (
    <div
      className="modal-mask"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeNotice();
      }}
    >
      <Modal
        title="Open Chat 的智能和速度现已全面提升啦！"
        onClose={closeNotice}
        actions={[
          <IconButton
            key="confirm"
            className={styles["update-notice-action"]}
            type="primary"
            text="知道了"
            onClick={closeNotice}
          />,
        ]}
      >
        <div className={styles["update-notice-content"]}>
          <p className={styles["update-notice-lead"]}>现底层模型已进行更新，</p>

          <div className={styles["update-notice-details"]}>
            <p>
              <strong>智能程度：</strong>
              在低、中、高三档上，相比之前分别提升了约90%、110% 和 70%
            </p>
            <p>
              <strong>回复速度：</strong>
              相比之前大幅提升约 3~4 倍，几秒钟即可一次性给出完整回复
            </p>
          </div>

          <p className={styles["update-notice-closing"]}>敬请期待更多更新~</p>
        </div>
      </Modal>
    </div>
  );
}

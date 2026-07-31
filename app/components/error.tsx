"use client";

import React from "react";
import { IconButton } from "./button";
import ResetIcon from "../icons/reload.svg";
import Locale from "../locales";
import { showConfirm } from "./ui-lib";
import { useSyncStore } from "../store/sync";
import { useChatStore } from "../store/chat";

interface IErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  info: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<any, IErrorBoundaryState> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Update state with error details
    this.setState({ hasError: true, error, info });
  }

  clearAndSaveData() {
    try {
      useSyncStore.getState().export();
    } finally {
      useChatStore.getState().clearAllData();
    }
  }

  render() {
    if (this.state.hasError) {
      // Render error message
      return (
        <div className="error" role="alert">
          <div className="error-mark" aria-hidden="true">
            !
          </div>
          <h2>页面暂时出了点问题</h2>
          <p>你的对话仍保存在这台设备上。请先重新载入页面。</p>

          <div className="error-actions">
            <IconButton
              text="重新载入"
              icon={<ResetIcon />}
              type="primary"
              onClick={() => window.location.reload()}
            />
            <IconButton
              text="导出后清除本地数据"
              onClick={async () => {
                if (await showConfirm(Locale.Settings.Danger.Reset.Confirm)) {
                  this.clearAndSaveData();
                }
              }}
              bordered
            />
          </div>

          <details className="error-details">
            <summary>查看错误详情</summary>
            <pre>
              <code>{this.state.error?.toString()}</code>
              <code>{this.state.info?.componentStack}</code>
            </pre>
          </details>
        </div>
      );
    }
    // if no error occurred, render children
    return this.props.children;
  }
}

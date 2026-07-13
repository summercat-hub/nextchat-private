import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { useChatStore } from "../store";

export function NewChat() {
  const chatStore = useChatStore();
  const navigate = useNavigate();

  useEffect(() => {
    chatStore.newSession();
    navigate(Path.Chat, { replace: true });
  }, [chatStore, navigate]);

  return null;
}

"use client";

import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "entertainment-chat:sessionId";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

function getOrCreateSessionId() {
  // sessionStorageを使用し、タブ/ブラウザを閉じたら会話履歴が失われるようにする
  let sessionId = window.sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export default function ChatApp() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // IME変換中かどうかを自前で追跡する(nativeEvent.isComposingはブラウザ/IMEによって
  // 変換確定Enterでもfalseにならないことがあるため、compositionstart/endで確実に判定する)
  const isComposingRef = useRef(false);

  useEffect(() => {
    const id = getOrCreateSessionId();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- マウント時に一度だけsessionIdを確定する
    setSessionId(id);

    (async () => {
      try {
        const res = await fetch(`/api/messages?sessionId=${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const data = await res.json();
        setMessages(data.messages ?? []);
      } catch {
        // 履歴取得に失敗しても空の会話から開始する
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !sessionId || isSending) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "応答の取得に失敗しました");
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラーが発生しました";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `エラー: ${detail}`, isError: true },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-[min(85vh,760px)] w-full max-w-2xl flex-col rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header className="border-b border-slate-200 bg-slate-800 px-4 py-3 dark:border-slate-700 sm:px-6 sm:py-4">
        <h1 className="text-base font-semibold tracking-wide text-white sm:text-lg">
          AI Chat
        </h1>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-6">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">
            メッセージを入力して会話を開始してください。
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-relaxed sm:max-w-[75%] ${
                m.role === "user"
                  ? "bg-slate-700 text-white dark:bg-slate-600"
                  : m.isError
                  ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                  : "border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex justify-start">
            <div className="max-w-[75%] rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800">
              応答を生成しています...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-slate-200 px-3 py-3 dark:border-slate-700 sm:px-6 sm:py-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // 変換確定のEnterや、IME処理中を示すkeyCode 229では送信しない
            if (isComposingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) {
              return;
            }
            sendMessage();
          }}
          placeholder="メッセージを入力してください"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
        />
        <button
          onClick={sendMessage}
          disabled={isSending || !input.trim()}
          className="shrink-0 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-600 dark:hover:bg-slate-500"
        >
          送信
        </button>
      </div>
    </div>
  );
}

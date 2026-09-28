"use client";

import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "entertainment-chat:sessionId";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_IMAGES_PER_MESSAGE = 3;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

type ImageAttachment = {
  mediaType: string;
  data: string; // base64(dataURLのプレフィックスを除いたもの)
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  images?: ImageAttachment[];
  isError?: boolean;
};

type PendingImage = ImageAttachment & {
  id: string;
  previewUrl: string; // data:mediaType;base64,xxx(プレビュー表示用)
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ChatApp() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachError(null);

    const incoming = Array.from(files);
    const room = MAX_IMAGES_PER_MESSAGE - pendingImages.length;
    if (incoming.length > room) {
      setAttachError(`画像は1メッセージにつき最大${MAX_IMAGES_PER_MESSAGE}枚までです`);
    }
    const accepted = incoming.slice(0, Math.max(room, 0));

    const next: PendingImage[] = [];
    for (const file of accepted) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setAttachError("対応していない画像形式です(png/jpeg/webp/gifのみ)");
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setAttachError(`画像サイズが大きすぎます(1枚あたり${MAX_IMAGE_BYTES / (1024 * 1024)}MBまで)`);
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const base64 = dataUrl.split(",")[1] ?? "";
        next.push({
          id: crypto.randomUUID(),
          mediaType: file.type,
          data: base64,
          previewUrl: dataUrl,
        });
      } catch {
        setAttachError("画像の読み込みに失敗しました");
      }
    }

    if (next.length > 0) {
      setPendingImages((prev) => [...prev, ...next]);
    }
  };

  const removePendingImage = (id: string) => {
    setPendingImages((prev) => prev.filter((img) => img.id !== id));
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if ((!trimmed && pendingImages.length === 0) || !sessionId || isSending) return;

    const imagesToSend: ImageAttachment[] = pendingImages.map(({ mediaType, data }) => ({
      mediaType,
      data,
    }));

    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed, images: imagesToSend },
    ]);
    setInput("");
    setPendingImages([]);
    setAttachError(null);
    setIsSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: trimmed, images: imagesToSend }),
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
              {m.images && m.images.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {m.images.map((img, imgIndex) => (
                    // eslint-disable-next-line @next/next/no-img-element -- base64データURLのためnext/imageの最適化は不要
                    <img
                      key={imgIndex}
                      src={`data:${img.mediaType};base64,${img.data}`}
                      alt="添付画像"
                      className="h-24 w-24 rounded object-cover"
                    />
                  ))}
                </div>
              )}
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

      <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-700 sm:px-6 sm:py-4">
        {pendingImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingImages.map((img) => (
              <div key={img.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- base64データURLのためnext/imageの最適化は不要 */}
                <img
                  src={img.previewUrl}
                  alt="添付予定の画像"
                  className="h-16 w-16 rounded border border-slate-300 object-cover dark:border-slate-600"
                />
                <button
                  onClick={() => removePendingImage(img.id)}
                  aria-label="画像を削除"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-xs text-white hover:bg-slate-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {attachError && (
          <p className="mb-2 text-xs text-red-600 dark:text-red-400">{attachError}</p>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pendingImages.length >= MAX_IMAGES_PER_MESSAGE}
            aria-label="画像を添付"
            className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            画像
          </button>
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
            maxLength={MAX_MESSAGE_LENGTH}
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
          />
          <button
            onClick={sendMessage}
            disabled={isSending || (!input.trim() && pendingImages.length === 0)}
            className="shrink-0 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-600 dark:hover:bg-slate-500"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}

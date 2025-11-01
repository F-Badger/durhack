import React, { useEffect, useRef, useState } from "react";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";

/*
  ChatApp (sentiment support)
  - Expects backend JSON shape like: { story: "...", sentiment: 0.42 }
  - Attaches sentiment value to the bot message object: { sender, text, streaming, sentiment }
*/

const CONTEXT_WINDOW_SIZE = 999;
const LOCAL_STORAGE_CONTEXT_KEY = "world_saver_chat_context_v1";
const LOCAL_STORAGE_USERNAME_KEY = "world_saver_username_v1";

const DEFAULT_MESSAGES = [
  {
    sender: "bot",
    text: "🌍 The world is crumbling... Tell me how you’ll help save it!",
    streaming: false,
    sentiment: null,
  },
];

export default function ChatApp() {
  // username handling (same as before)
  const initialStoredUsername = (() => {
    try {
      const v = localStorage.getItem(LOCAL_STORAGE_USERNAME_KEY);
      if (!v || v.trim() === "" || v === "anonymous") return null;
      return v;
    } catch {
      return null;
    }
  })();

  const [username, setUsername] = useState(initialStoredUsername || "");
  const [usernameLocked, setUsernameLocked] = useState(
    Boolean(initialStoredUsername)
  );
  const [showUsernameModal, setShowUsernameModal] = useState(
    !initialStoredUsername
  );

  // messages
  const [messages, setMessages] = useState(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_CONTEXT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return DEFAULT_MESSAGES;
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const chatBoxRef = useRef(null);

  // persist context
  useEffect(() => {
    const ctx = getContextWindow(messages, CONTEXT_WINDOW_SIZE);
    try {
      localStorage.setItem(LOCAL_STORAGE_CONTEXT_KEY, JSON.stringify(ctx));
    } catch {}
    if (chatBoxRef.current)
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (usernameLocked && username) {
      try {
        localStorage.setItem(LOCAL_STORAGE_USERNAME_KEY, username);
      } catch {}
    }
  }, [usernameLocked, username]);

  // helpers to manage messages
  function getContextWindow(allMessages, windowSize) {
    if (!Array.isArray(allMessages)) return [];
    return allMessages.slice(-windowSize);
  }

  function buildApiConversationPayload(windowMessages) {
    return windowMessages.map((m) => {
      const role = m.sender === "user" ? "user" : "assistant";
      return { role, content: m.text };
    });
  }

  function appendMessage(message) {
    setMessages((prev) => [...prev, message]);
  }

  function replaceLastMessage(updater) {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const copy = prev.slice();
      copy[copy.length - 1] =
        typeof updater === "function"
          ? updater(copy[copy.length - 1])
          : updater;
      return copy;
    });
  }

  // Stream message char-by-char and leave sentiment in place
  async function streamBotMessage(fullText) {
    // if there's no placeholder, ensure one exists
    const last = messages[messages.length - 1] || {};
    if (!last || last.sender !== "bot") {
      appendMessage({
        sender: "bot",
        text: "",
        streaming: true,
        sentiment: null,
      });
    } else {
      // mark streaming true if not already
      replaceLastMessage((l) => ({ ...l, streaming: true }));
    }

    for (let i = 0; i < fullText.length; i++) {
      await new Promise((r) => setTimeout(r, 16));
      replaceLastMessage((l) => ({ ...l, text: fullText.slice(0, i + 1) }));
    }

    replaceLastMessage((l) => ({ ...l, streaming: false }));
  }

  // network controller to allow abort on reset
  const isComponentMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);
  useEffect(() => {
    isComponentMountedRef.current = true;
    return () => {
      isComponentMountedRef.current = false;
      if (fetchControllerRef.current) {
        try {
          fetchControllerRef.current.abort();
        } catch {}
        fetchControllerRef.current = null;
      }
    };
  }, []);

  // handle send: call backend, parse story + sentiment, attach sentiment to message then stream text
  async function handleSend(userText) {
    if (!userText || !userText.trim() || isGenerating) return;
    if (!usernameLocked || !username) {
      alert("Please set a username first.");
      return;
    }

    // show user message immediately
    appendMessage({ sender: "user", text: userText, streaming: false });

    // build payload (include new user message in context)
    const contextIncludingThisAction = getContextWindow(
      [...messages, { sender: "user", text: userText }],
      CONTEXT_WINDOW_SIZE
    );
    const payload = {
      username: username || "anonymous",
      previouscontext: buildApiConversationPayload(contextIncludingThisAction),
      action: userText,
    };

    console.log("Outgoing payload:", payload);

    setIsGenerating(true);

    // create placeholder bot message (we'll update it)
    appendMessage({
      sender: "bot",
      text: "",
      streaming: true,
      sentiment: null,
    });

    try {
      const controller = new AbortController();
      fetchControllerRef.current = controller;

      const resp = await fetch("http://localhost:5000/api/submit-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const ct = resp.headers.get("content-type") || "";
      let responseText = "";
      let sentimentValue = null;

      if (ct.includes("application/json")) {
        const j = await resp.json();

        // preferred: backend returns { story: "...", sentiment: 0.42 }
        if (j && typeof j === "object") {
          if (typeof j.story === "string") responseText = j.story;
          else if (typeof j.text === "string") responseText = j.text;
          else if (typeof j.output === "string") responseText = j.output;
          else responseText = JSON.stringify(j);

          // try common sentiment fields
          if (j.sentiment !== undefined && j.sentiment !== null) {
            // accept numeric or numeric-as-string
            const n = Number(j.sentiment);
            sentimentValue = Number.isFinite(n) ? n : null;
          } else if (j.score !== undefined && j.score !== null) {
            const n = Number(j.score);
            sentimentValue = Number.isFinite(n) ? n : null;
          }
        } else if (typeof j === "string") {
          responseText = j;
        }
      } else {
        // plain text response
        responseText = await resp.text();
      }

      // attach sentiment to the placeholder bot message (if any)
      if (isComponentMountedRef.current) {
        replaceLastMessage((l) => ({ ...l, sentiment: sentimentValue }));
      }

      // stream the story text into the UI (updates the last message text)
      if (isComponentMountedRef.current) {
        await streamBotMessage(responseText || "(no story returned)");
      }
    } catch (err) {
      if (err && err.name === "AbortError") {
        // aborted, do nothing
      } else {
        appendMessage({
          sender: "bot",
          text:
            "(error) Could not reach AI: " +
            (err && err.message ? err.message : String(err)),
          streaming: false,
          sentiment: null,
        });
      }
    } finally {
      fetchControllerRef.current = null;
      if (isComponentMountedRef.current) setIsGenerating(false);
    }
  }

  // reset function (unchanged)
  function handleResetApp() {
    const ok = window.confirm(
      "Reset the app? This will clear username, chat history and UI state."
    );
    if (!ok) return;
    try {
      localStorage.removeItem(LOCAL_STORAGE_USERNAME_KEY);
      localStorage.removeItem(LOCAL_STORAGE_CONTEXT_KEY);
    } catch {}
    // abort in-flight requests
    if (fetchControllerRef.current) {
      try {
        fetchControllerRef.current.abort();
      } catch {}
      fetchControllerRef.current = null;
    }
    isComponentMountedRef.current = false;
    setIsGenerating(false);
    setMessages(DEFAULT_MESSAGES.slice());
    setUsername("");
    setUsernameLocked(false);
    setShowUsernameModal(true);
    setTimeout(() => {
      isComponentMountedRef.current = true;
      if (chatBoxRef.current)
        chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }, 50);
  }

  // username modal (unchanged)
  function handleSetUsername(submittedName) {
    const trimmed = (submittedName || "").trim();
    if (!trimmed) return;
    setUsername(trimmed);
    setUsernameLocked(true);
    setShowUsernameModal(false);
    try {
      localStorage.setItem(LOCAL_STORAGE_USERNAME_KEY, trimmed);
    } catch {}
  }

  // UsernameModal component (omitted here for brevity) - assume you already have it in place
  const UsernameModal = ({ visible, defaultName, onSubmit }) => {
    const [draft, setDraft] = useState(defaultName || "");
    useEffect(() => setDraft(defaultName || ""), [defaultName, visible]);
    if (!visible) return null;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2000,
        }}
        aria-modal="true"
      >
        <div
          style={{
            background: "#0f1221",
            padding: 20,
            borderRadius: 12,
            width: 420,
            maxWidth: "94%",
            boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.03)",
            color: "#eef1ff",
          }}
        >
          <h2 style={{ margin: 0, marginBottom: 8, fontSize: 18 }}>
            Pick a username
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(draft);
            }}
            style={{ display: "flex", gap: 8, marginTop: 12 }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Choose a username"
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.02)",
                color: "#eef1ff",
                fontSize: 14,
              }}
            />
            <button
              type="submit"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                background: "#4b8cff",
                color: "white",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Start
            </button>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="chat-container">
      <UsernameModal
        visible={showUsernameModal}
        defaultName={username}
        onSubmit={handleSetUsername}
      />

      <div
        style={{
          padding: "10px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.03)",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <label style={{ color: "#cfd6ff", fontSize: 13 }}>Username</label>
        {usernameLocked ? (
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.03)",
              background: "rgba(255,255,255,0.01)",
              color: "#eef1ff",
              minWidth: 140,
            }}
            title="Username is locked for this session. Reset to change."
          >
            {username}
          </div>
        ) : (
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.02)",
              color: "#eef1ff",
              minWidth: 140,
            }}
          />
        )}

        <button
          onClick={handleResetApp}
          style={{
            marginLeft: 12,
            padding: "6px 10px",
            borderRadius: 8,
            border: "none",
            background: "#ff7a7a",
            color: "#111",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
          title="Reset the app (clears username, messages and UI state)"
        >
          Restart
        </button>
      </div>

      <div className="chat-box" ref={chatBoxRef}>
        {messages.map((msg, index) => (
          <ChatMessage
            key={index}
            sender={msg.sender}
            text={msg.text}
            streaming={msg.streaming}
            sentiment={msg.sentiment ?? null}
          />
        ))}

        {isGenerating && (
          <div className="thinking-row">
            <div className="thinking-bubble">
              <div className="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <div className="thinking-label">Bot is thinking…</div>
            </div>
          </div>
        )}
      </div>

      <ChatInput onSend={handleSend} disabled={isGenerating} />
    </div>
  );
}

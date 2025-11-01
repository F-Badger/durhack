import React, { useEffect, useRef, useState } from "react";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";

/*
  ChatApp (with Reset)
  - On first run: forces the user to pick a username via a modal.
  - Reset app button clears username + context and returns UI to initial state.
  - Payload remains: { username, previouscontext, action }
  - Streaming, thinking indicator and context window unchanged.
*/

const CONTEXT_WINDOW_SIZE = 999; // keep a lot of context if you want
const LOCAL_STORAGE_CONTEXT_KEY = "world_saver_chat_context_v1";
const LOCAL_STORAGE_USERNAME_KEY = "world_saver_username_v1";

// Default starting messages (used for reset)
const DEFAULT_MESSAGES = [
  {
    sender: "bot",
    text: "🌍 The world is crumbling... Tell me how you’ll help save it!",
    streaming: false,
  },
];

export default function ChatApp() {
  // Read username from localStorage initially (if present).
  // Treat empty / "anonymous" as not set so modal will show.
  const initialStoredUsername = (() => {
    try {
      const v = localStorage.getItem(LOCAL_STORAGE_USERNAME_KEY);
      if (!v || v.trim() === "" || v === "anonymous") return null;
      return v;
    } catch {
      return null;
    }
  })();

  // Username and lock state
  const [username, setUsername] = useState(initialStoredUsername || "");
  const [usernameLocked, setUsernameLocked] = useState(
    Boolean(initialStoredUsername)
  );
  const [showUsernameModal, setShowUsernameModal] = useState(
    !initialStoredUsername
  );

  // Messages state (hydrated from localStorage if present)
  const [messages, setMessages] = useState(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_CONTEXT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_MESSAGES;
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const chatBoxRef = useRef(null);

  // Persist messages context whenever messages change
  useEffect(() => {
    const contextWindow = getContextWindow(messages, CONTEXT_WINDOW_SIZE);
    try {
      localStorage.setItem(
        LOCAL_STORAGE_CONTEXT_KEY,
        JSON.stringify(contextWindow)
      );
    } catch {
      // ignore
    }
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  // Persist username only when locked (so we don't save partial edits)
  useEffect(() => {
    if (usernameLocked && username) {
      try {
        localStorage.setItem(LOCAL_STORAGE_USERNAME_KEY, username);
      } catch {
        // ignore
      }
    }
  }, [usernameLocked, username]);

  // Helpers
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

  // Streaming bot text
  async function streamBotMessage(fullText) {
    appendMessage({ sender: "bot", text: "", streaming: true });

    for (let i = 0; i < fullText.length; i++) {
      // If user reset while streaming, abort early
      if (!isComponentMountedRef.current) break;

      await new Promise((r) => setTimeout(r, 16));
      replaceLastMessage((last) => ({
        ...last,
        text: fullText.slice(0, i + 1),
      }));
    }

    replaceLastMessage((last) => ({ ...last, streaming: false }));
  }

  // Track mount to abort streaming when resetting
  const isComponentMountedRef = useRef(true);
  useEffect(() => {
    isComponentMountedRef.current = true;
    return () => {
      isComponentMountedRef.current = false;
    };
  }, []);

  // Handler that sends payload { username, previouscontext, action }
  async function handleSend(userText) {
    if (!userText || !userText.trim() || isGenerating) return;

    if (!usernameLocked || !username) {
      alert("Please set a username first.");
      return;
    }

    appendMessage({ sender: "user", text: userText, streaming: false });

    // Build context including this action (do not rely on state update timing)
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

    try {
      // Replace with actual API call or streaming logic
      await new Promise((r) => setTimeout(r, 600));
      const fakeResponse = createFunnyDramaticVignette(userText);
      if (isComponentMountedRef.current) await streamBotMessage(fakeResponse);
    } catch (err) {
      appendMessage({
        sender: "bot",
        text: "(error) Could not reach AI: " + err.message,
        streaming: false,
      });
    } finally {
      if (isComponentMountedRef.current) setIsGenerating(false);
    }
  }

  // Reset app: clears localStorage and resets React state to initial defaults.
  function handleResetApp() {
    // Optional: confirm reset with user
    const ok = window.confirm(
      "Reset the app? This will clear username, chat history and UI state."
    );
    if (!ok) return;

    try {
      localStorage.removeItem(LOCAL_STORAGE_USERNAME_KEY);
      localStorage.removeItem(LOCAL_STORAGE_CONTEXT_KEY);
    } catch {
      // ignore localStorage errors
    }

    // Stop any in-progress generation and abort streaming by toggling mounted flag
    isComponentMountedRef.current = false;

    // Reset React state
    setIsGenerating(false);
    setMessages(DEFAULT_MESSAGES.slice()); // shallow copy
    setUsername("");
    setUsernameLocked(false);
    setShowUsernameModal(true);

    // Ensure mounted flag restored after a tick so streaming can run again later
    setTimeout(() => {
      isComponentMountedRef.current = true;
      // scroll to bottom if needed
      if (chatBoxRef.current)
        chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }, 50);
  }

  // Username modal submit — locks username until reload or reset
  function handleSetUsername(submittedName) {
    const trimmed = (submittedName || "").trim();
    if (!trimmed) {
      return;
    }
    setUsername(trimmed);
    setUsernameLocked(true);
    setShowUsernameModal(false);
    try {
      localStorage.setItem(LOCAL_STORAGE_USERNAME_KEY, trimmed);
    } catch {
      // ignore
    }
  }

  // Offline vignette generator (keeps UI working without API)
  function createFunnyDramaticVignette(userIdea) {
    const seed = Math.abs(hashString(userIdea)) % 5;
    const intros = [
      `Against a sky of neon ash, your choice to "${userIdea}" caused a surprising chain reaction:`,
      `In the last library of the city, someone read about your idea to "${userIdea}", and everything changed:`,
      `The pigeons (finally) took notice when people decided to "${userIdea}". The consequences:`,
      `A single streetlight blinked and—because of your idea to "${userIdea}"—an entire neighborhood started to hum:`,
      `Legend says that when people pledged to "${userIdea}", the vending machines felt ashamed and did this:`,
    ];
    const endings = [
      `Soon, rivers started tasting faintly of cinnamon. The world sighed and some plants learned to dance.`,
      `Within days, bicycles developed their own opinions and started lecturing commuters. It was touching.`,
      `All plastic balloons deflated politely and apologized to children. The sun looked less inconvenienced.`,
      `Traffic lights joined a choir and sang commuters through the crosswalk. People clapped awkwardly.`,
      `Giant rubber ducks formed a union and demanded better working conditions. Negotiations are ongoing.`,
    ];
    const intro = intros[seed % intros.length];
    const ending = endings[(seed + 2) % endings.length];
    return `${intro} ${ending}`;
  }

  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    return h >>> 0;
  }

  // Username modal component (appears on first run or after reset)
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
          <p
            style={{
              margin: 0,
              marginBottom: 12,
              color: "#c9d0ff",
              fontSize: 13,
            }}
          ></p>

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

          <div style={{ marginTop: 10, fontSize: 12, color: "#9fa7ff" }}></div>
        </div>
      </div>
    );
  };

  // Top bar + UI
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

        {/* Reset app button (clears username, context and resets UI) */}
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
            sentiment={0}
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

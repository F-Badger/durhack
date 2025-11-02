import React, { useEffect, useRef, useState } from "react";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";

const CONTEXT_WINDOW_SIZE = 999;
const LOCAL_STORAGE_CONTEXT_KEY = "world_saver_chat_context_v1";
const LOCAL_STORAGE_USERNAME_KEY = "world_saver_username_v1";

const WINNING_SCORE = 15;
const LOSING_SCORE = -5;

// Default starting message used only as fallback (sentiment = 0)
const DEFAULT_MESSAGES = [
  {
    sender: "bot",
    text: "🌍 The world is crumbling... Tell me how you’ll help save it!",
    streaming: false,
    sentiment: 0,
  },
];

export default function ChatApp() {
  // username handling
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

  const [gameOver, setGameOver] = useState(false);
  const [gameResult, setGameResult] = useState(null); // null | 'win' | 'lose'

  // messages: hydrate from localStorage if present, otherwise start empty so we can fetch
  const [messages, setMessages] = useState(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_CONTEXT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    // start empty — we'll fetch the initial message after username is set
    return [];
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const chatBoxRef = useRef(null);
  const fetchControllerRef = useRef(null);
  const mountedRef = useRef(true);

  const [score, setScore] = useState(0);

  // Persist recent context when messages change
  useEffect(() => {
    const ctx = getContextWindow(messages, CONTEXT_WINDOW_SIZE);
    try {
      localStorage.setItem(LOCAL_STORAGE_CONTEXT_KEY, JSON.stringify(ctx));
    } catch {}
    if (chatBoxRef.current)
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [messages]);

  // Persist username when locked
  useEffect(() => {
    if (usernameLocked && username) {
      try {
        localStorage.setItem(LOCAL_STORAGE_USERNAME_KEY, username);
      } catch {}
    }
  }, [usernameLocked, username]);

  // cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (fetchControllerRef.current) {
        try {
          fetchControllerRef.current.abort();
        } catch {}
        fetchControllerRef.current = null;
      }
    };
  }, []);

  // Fetch initial message once: only when username is locked (set) AND we have no messages
  useEffect(() => {
    let called = false;
    async function fetchFirstMessage() {
      if (called) return;
      called = true;

      // only fetch if no messages (fresh user) and username is set/locked
      if (messages.length > 0 || !usernameLocked || !username) return;

      setIsGenerating(true);
      const controller = new AbortController();
      fetchControllerRef.current = controller;

      try {
        const payload = { username };
        const resp = await fetch("http://localhost:5000/api/first-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const j = await resp.json();
        const story =
          typeof j.story === "string"
            ? j.story
            : typeof j.text === "string"
            ? j.text
            : null;
        const sentimentValue =
          j && (j.sentiment ?? j.score) != null
            ? Number(j.sentiment ?? j.score)
            : 0;

        // Append a single bot placeholder with sentiment (streamBotMessage will reuse it)
        setMessages((prev) => [
          ...prev,
          {
            sender: "bot",
            text: "",
            streaming: true,
            sentiment: Number.isFinite(sentimentValue) ? sentimentValue : -1,
          },
        ]);

        // stream the story into that placeholder
        const textToStream = story || DEFAULT_MESSAGES[0].text;
        await streamBotMessage(textToStream);
      } catch (err) {
        console.error("Failed to fetch initial message:", err);
        // fallback to default message with sentiment 0 (replace messages)
        setMessages(DEFAULT_MESSAGES.slice());
      } finally {
        fetchControllerRef.current = null;
        if (mountedRef.current) setIsGenerating(false);
      }
    }

    fetchFirstMessage();
    // run when usernameLocked changes or when messages length is zero initially
  }, [usernameLocked, username, messages.length]);

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

  // streamBotMessage: reuse existing placeholder if it's the last bot with streaming:true
  async function streamBotMessage(fullText) {
    // Ensure there's a placeholder to fill. If a last message is a bot and streaming === true, reuse it.
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.sender === "bot" && last.streaming) {
        return prev; // reuse
      }
      // append one placeholder (no sentiment)
      return [
        ...prev,
        { sender: "bot", text: "", streaming: true, sentiment: null },
      ];
    });

    // Type into the last message
    for (let i = 0; i < fullText.length; i++) {
      if (!mountedRef.current) break;
      await new Promise((r) => setTimeout(r, 16));
      replaceLastMessage((l) => ({ ...l, text: fullText.slice(0, i + 1) }));
    }

    // mark streaming finished
    replaceLastMessage((l) => ({ ...l, streaming: false }));
  }

  // handleSend: append user message, call backend, append one bot placeholder with sentiment, stream text
  async function handleSend(userText) {
    if (!userText || !userText.trim() || isGenerating || gameOver) return;
    if (!usernameLocked || !username) {
      alert("Please set a username first.");
      return;
    }

    appendMessage({ sender: "user", text: userText, streaming: false });

    const contextIncludingThisAction = getContextWindow(
      [...messages, { sender: "user", text: userText }],
      CONTEXT_WINDOW_SIZE
    );
    const payload = {
      username,
      previouscontext: buildApiConversationPayload(contextIncludingThisAction),
      action: userText,
      score: score,
    };

    let tempScore = score;
    let finalResult = null; // 'win' | 'lose' | null

    console.log("Outgoing payload:", payload);
    setIsGenerating(true);

    const controller = new AbortController();
    fetchControllerRef.current = controller;

    try {
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
        if (j && typeof j === "object") {
          responseText = j.story ?? j.text ?? j.output ?? "";
          console.log(j);
          // parse sentiment/score delta
          sentimentValue =
            j.sentiment != null
              ? Number(j.sentiment)
              : j.scoreDelta != null
              ? Number(j.scoreDelta)
              : null;

          const extraScore =
            j && j.scoreDelta != null ? Number(j.scoreDelta) : 0;
          tempScore += extraScore;
          setScore((cur) => cur + extraScore);
        } else if (typeof j === "string") {
          responseText = j;
        }
      } else {
        responseText = await resp.text();
      }

      // Check win/lose conditions using updated tempScore
      if (tempScore >= WINNING_SCORE) {
        finalResult = "win";
        setGameResult("win");
        setGameOver(true);

        // request extra win description (optional - you already do this)
        try {
          const payload2 = {
            username,
            previouscontext: buildApiConversationPayload(
              contextIncludingThisAction
            ),
            action: userText,
            score: tempScore,
          };

          const resp2 = await fetch(
            "http://localhost:5000/api/generate-win-description",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload2),
              signal: controller.signal,
            }
          );
          if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);
          const j2 = await resp2.json();
          responseText = j2.story ?? j2.text ?? responseText;
        } catch (e) {
          console.warn("Failed to fetch win description:", e);
        }
      } else if (tempScore <= LOSING_SCORE) {
        finalResult = "lose";
        setGameResult("lose");
        setGameOver(true);

        try {
          const payload2 = {
            username,
            previouscontext: buildApiConversationPayload(
              contextIncludingThisAction
            ),
            action: userText,
            score: tempScore,
          };

          const resp2 = await fetch(
            "http://localhost:5000/api/generate-lose-description",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload2),
              signal: controller.signal,
            }
          );
          if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);
          const j2 = await resp2.json();
          responseText = j2.story ?? j2.text ?? responseText;
        } catch (e) {
          console.warn("Failed to fetch lose description:", e);
        }
      }

      // Append exactly one bot placeholder with sentiment (so we won't create two bubbles)
      appendMessage({
        sender: "bot",
        text: "",
        streaming: true,
        sentiment: Number.isFinite(sentimentValue) ? sentimentValue : null,
      });

      // Stream the response text into that placeholder
      await streamBotMessage(responseText || "(no story returned)");

      // --- AFTER streaming finishes, if the game just ended, append the final "game over" announcement bubble ---
      if (finalResult) {
        const announcement =
          finalResult === "win"
            ? `🎉 Game over — you WON! Final score: ${tempScore}. Congratulations! Press Restart to try again!`
            : `💥 Game over — you LOST. Final score: ${tempScore}. Better luck next time. Press Restart to try again!`;

        // small delay so the announcement appears after the streamed text
        await new Promise((r) => setTimeout(r, 350));

        appendMessage({
          sender: "bot",
          text: announcement,
          streaming: false,
          sentiment: finalResult === "win" ? 1 : -0.75,
        });
      }
    } catch (err) {
      if (err && err.name === "AbortError") {
        // aborted by reset/unmount
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
      if (mountedRef.current) setIsGenerating(false);
    }
  }

  // Reset app: clear localStorage and reload page to ensure consistent state
  function handleResetApp() {
    const ok = window.confirm("Reset everything?");
    if (!ok) return;
    try {
      localStorage.removeItem(LOCAL_STORAGE_USERNAME_KEY);
      localStorage.removeItem(LOCAL_STORAGE_CONTEXT_KEY);
      setGameOver(false);
    } catch {}
    window.location.reload();
  }

  // Username flow
  function handleSetUsername(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    setUsername(trimmed);
    setUsernameLocked(true);
    setShowUsernameModal(false);
    try {
      localStorage.setItem(LOCAL_STORAGE_USERNAME_KEY, trimmed);
    } catch {}
  }

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
          <h2 style={{ marginBottom: 10 }}>Pick a username</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(draft);
            }}
            style={{ display: "flex", gap: 8 }}
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
                fontWeight: 600,
                cursor: "pointer",
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
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.03)",
            background: "rgba(255,255,255,0.01)",
            color: "#eef1ff",
            minWidth: 140,
          }}
        >
          {username}
        </div>
        <label style={{ color: "#cfd6ff", fontSize: 13 }}>Score: {score}</label>
        <button
          onClick={handleResetApp}
          style={{
            marginLeft: "auto",
            padding: "6px 10px",
            borderRadius: 8,
            border: "none",
            background: "#ff7a7a",
            color: "#111",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
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
            sentiment={msg.sentiment}
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
              <div className="thinking-label">
                Your future is being decided...
              </div>
            </div>
          </div>
        )}
      </div>

      <ChatInput onSend={handleSend} disabled={isGenerating || gameOver} />
    </div>
  );
}

import React from "react";

export default function ChatMessage({ sender, text, sentiment }) {
  let red = 0x440000;
  let green = 0x004400;
  let blue = 0x000044;
  if ( sentiment < 0 ) {
    red = Math.floor(-187*sentiment)+0x44;
  } else {
    green = Math.floor(187*sentiment)+0x44;
  };
  var colour = red&&green&&blue

  const isUser = sender === "user";

  const colour = "#c43b1fff";

  return (
    <div className={`message-row ${isUser ? "user-message" : "bot-message"}`}>
      <div
        className="message-bubble"
        style={!isUser ? { backgroundColor: colour } : {}}
      >
        {text}
      </div>
    </div>
  );
}

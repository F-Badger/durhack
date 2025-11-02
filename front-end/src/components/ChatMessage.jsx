export default function ChatMessage({ sender, text, sentiment }) {
  let red = 0x44;
  let green = 0x44;
  let blue = 0x44;
  if (sentiment < 0) {
    red = Math.floor(-187 * sentiment) + 0x44;
  } else {
    green = Math.floor(70 * sentiment) + 0x44;
  }
  var colour = red | green | blue;

  // console.log(sentiment);
  var colour = `rgb(${red},${green},${blue})`;
  const isUser = sender === "user";
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

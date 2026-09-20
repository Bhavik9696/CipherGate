import { useState } from "react";
import { askAssistant } from "../services/api.js";
import "./AssistantWidget.css";

const SUGGESTIONS = ["How does HMAC stop tampering?", "Explain replay protection", "How do I use Request Editor?"];

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  async function submit(value = question) {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setQuestion("");
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setLoading(true);
    const response = await askAssistant(trimmed);
    const data = response.data || {};
    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        text: data.answer || data.message || "The assistant is unavailable right now.",
        sources: data.sources || [],
      },
    ]);
    setLoading(false);
  }

  return (
    <>
      {open && (
        <section className="assistant" aria-label="CipherGate security assistant">
          <header className="assistant__header">
            <div>
              <span className="assistant__eyebrow">GROUNDED RETRIEVAL</span>
              <h2>Security copilot</h2>
            </div>
            <button className="assistant__close" onClick={() => setOpen(false)} aria-label="Close assistant">×</button>
          </header>
          <div className="assistant__messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="assistant__welcome">
                <strong>Ask about the gateway.</strong>
                <p>Answers are grounded in the CipherGate security docs.</p>
                <div className="assistant__suggestions">
                  {SUGGESTIONS.map((suggestion) => <button key={suggestion} onClick={() => submit(suggestion)}>{suggestion}</button>)}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div className={`assistant__message assistant__message--${message.role}`} key={`${message.role}-${index}`}>
                <div>{message.text}</div>
                {message.sources?.length > 0 && <small>Sources: {message.sources.map((source) => source.title).join(" · ")}</small>}
              </div>
            ))}
            {loading && <div className="assistant__typing">Retrieving security notes...</div>}
          </div>
          <form className="assistant__form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a security question" aria-label="Ask a security question" />
            <button type="submit" aria-label="Send question">↑</button>
          </form>
        </section>
      )}
      <button className={`assistant__launcher ${open ? "assistant__launcher--hidden" : ""}`} onClick={() => setOpen(true)} aria-label="Open security assistant">
        <span>✦</span> Ask CipherGate
      </button>
    </>
  );
}
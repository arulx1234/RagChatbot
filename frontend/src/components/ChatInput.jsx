import { useRef, useState } from "react";

function ChatInput({ onSendMessage, onDocumentUpload, placeholder }) {
  const [message, setMessage] = useState("");
  const fileInputRef = useRef(null);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!message.trim()) return;

    onSendMessage(message.trim());

    setMessage("");
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];

    if (file) {
      onDocumentUpload(file);
    }

    event.target.value = "";
  };

  return (
    <form className="chat-input-container" onSubmit={handleSubmit}>
      <div className="chat-attachment">
        <button
          className="chat-attachment-button"
          type="button"
          aria-label="Upload document"
          title="Upload document"
          onClick={() => fileInputRef.current?.click()}
        >
          +
        </button>
        <input
          ref={fileInputRef}
          className="chat-file-input"
          type="file"
          accept=".pdf,.txt,.docx"
          aria-label="Choose a document to upload"
          onChange={handleFileChange}
          tabIndex={-1}
        />
      </div>
      <input
        type="text"
        placeholder={placeholder || "Ask a question about your document..."}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />

      <button className="chat-send-button" type="submit">
        ➤
      </button>
    </form>
  );
}

export default ChatInput;
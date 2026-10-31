import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";

function ChatWindow({
  messages,
  isThinking,
  selectedDocuments = [],
  onSendMessage,
  onDocumentUpload,
  onRegenerate,
}) {
  const placeholderText =
    selectedDocuments.length > 1
      ? `Ask a question across ${selectedDocuments.length} selected documents...`
      : selectedDocuments.length === 1
      ? `Ask a question about ${selectedDocuments[0].name}...`
      : "Select one or more documents to ask questions...";

  return (
    <section className="chat-container">

      {messages.length === 0 && (
        <div className="welcome-section">
          <div className="bot-icon">ðŸ¤–</div>
          <h2>Welcome to ansAce</h2>
          <p>
            {selectedDocuments.length > 1
              ? `You have selected ${selectedDocuments.length} documents. Ask any question to retrieve and compare information across all of them!`
              : selectedDocuments.length === 1
              ? `Ready to answer questions about ${selectedDocuments[0].name}.`
              : "Upload and select documents to start asking questions."}
          </p>
        </div>
      )}

      <div className="messages">
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            message={message.content}
            sources={message.sources}
            timestamp={message.timestamp}
            onRegenerate={
              message.role === "assistant" &&
              index === messages.length - 1
                ? () => onRegenerate(message.id)
                : undefined
            }
          />
        ))}
        {isThinking && (
          <ChatMessage
            key="thinking"
            role="assistant"
            message="Searching and analyzing selected documents..."
            timestamp={new Date().toISOString()}
          />
        )}
      </div>

      <ChatInput
        onSendMessage={onSendMessage}
        onDocumentUpload={onDocumentUpload}
        placeholder={placeholderText}
      />
    </section>
  );
}

export default ChatWindow;

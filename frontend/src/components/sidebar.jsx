import { useEffect, useState } from "react";

function Sidebar({
  documents,
  chatHistory,
  currentChatId,
  user,
  selectedDocumentIds = [],
  activeDocumentId,
  onToggleDocument,
  onSelectDocument,
  onSelectAllDocuments,
  onClearDocumentSelection,
  onDocumentRemove,
  onNewChat,
  onSelectChat,
  onLogout,
  isOpen,
  onClose,
}) {
  const [isSignOutOpen, setIsSignOutOpen] = useState(false);

  useEffect(() => {
    if (!isSignOutOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsSignOutOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isSignOutOpen]);

  const getStatus = (status) => {
    if (status === "uploading") return "Uploading";
    if (status === "processing") return "Processing document";
    if (status === "ready") return "Ready";
    return "Error";
  };

  const readyDocuments = documents.filter((doc) => doc.status === "ready");
  const effectiveSelectedIds = selectedDocumentIds;
  const selectedCount = effectiveSelectedIds.length;

  const handleDocumentClick = (docId) => {
    if (onToggleDocument) {
      onToggleDocument(docId);
    } else if (onSelectDocument) {
      onSelectDocument(docId);
    }
  };

  const getChatDocumentLabel = (chat) => {
    if (Array.isArray(chat.documentIds) && chat.documentIds.length > 1) {
      return `${chat.documentIds.length} documents`;
    }
    const docId = Array.isArray(chat.documentIds) && chat.documentIds.length === 1
      ? chat.documentIds[0]
      : chat.documentId;
    return documents.find((doc) => doc.id === docId)?.name || "Document unavailable";
  };

  return (
    <aside
      id="documents-panel"
      className={`sidebar ${isOpen ? "sidebar-open" : ""}`}
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <div className="sidebar-header">
        <h2>ansAce</h2>
        <button
          className="sidebar-close-button"
          type="button"
          aria-label="Close documents menu"
          onClick={onClose}
        >
          x
        </button>
      </div>

      <button
        className="new-chat-btn sidebar-new-chat-btn"
        type="button"
        onClick={onNewChat}
      >
        <svg
          className="new-chat-icon"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path d="M12 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
          <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
        </svg>
        <span>New Chat</span>
      </button>

      <section className="history-section" aria-labelledby="history-heading">
        <h3 id="history-heading" className="sidebar-section-title">History</h3>
        <div className="history-list">
          {chatHistory.map((chat) => (
            <button
              className={`history-item ${currentChatId === chat.id ? "selected" : ""}`}
              key={chat.id}
              type="button"
              title={chat.title}
              aria-current={currentChatId === chat.id ? "page" : undefined}
              onClick={() => onSelectChat(chat)}
            >
              <span className="history-item-title">{chat.title}</span>
              <span className="history-item-document">
                {getChatDocumentLabel(chat)}
              </span>
            </button>
          ))}
          {chatHistory.length === 0 && (
            <p className="history-empty">Your document questions will appear here.</p>
          )}
        </div>
      </section>

      <section className="sidebar-documents" aria-labelledby="documents-heading">
        <div className="sidebar-section-header">
          <h3 id="documents-heading" className="sidebar-section-title">
            Documents ({selectedCount}/{readyDocuments.length})
          </h3>
          {readyDocuments.length > 0 && (
            <div className="doc-selection-actions">
              <button
                type="button"
                className="doc-action-btn"
                onClick={onSelectAllDocuments}
                title="Select all ready documents"
              >
                Select all
              </button>
              <button
                type="button"
                className="doc-action-btn"
                onClick={onClearDocumentSelection}
                title="Clear document selection"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="document-list">
          {documents.map((document) => {
            const isSelected = effectiveSelectedIds.includes(document.id);
            const isReady = document.status === "ready";

            return (
              <div
                className={`document-item ${isSelected ? "selected" : ""}`}
                key={document.id}
              >
                <label
                  className="document-checkbox-wrapper"
                  title={isSelected ? "Deselect document" : "Select document"}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="document-checkbox"
                    checked={isSelected}
                    disabled={!isReady}
                    onChange={() => handleDocumentClick(document.id)}
                    aria-label={`Select ${document.name}`}
                  />
                  <span className="custom-checkbox-ui" />
                </label>

                <button
                  className="document-select-button"
                  type="button"
                  aria-label={`Toggle selection for ${document.name}`}
                  aria-pressed={isSelected}
                  disabled={!isReady}
                  onClick={() => handleDocumentClick(document.id)}
                >
                  <svg className="document-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 3h8l4 4v14H6z" />
                    <path d="M14 3v5h5M9 13h6M9 17h6" />
                  </svg>
                  <span className="document-info">
                    <span className="document-name">{document.name}</span>
                    <span className={`status-${document.status}`}>
                      {getStatus(document.status)}
                      {document.status === "uploading" && ` ${document.progress}%`}
                    </span>
                    {document.error && (
                      <span className="upload-error" role="alert">{document.error}</span>
                    )}
                    {document.status === "uploading" && (
                      <span className="upload-progress" aria-label={`Uploading ${document.progress}%`}>
                        <span className="upload-progress-bar" style={{ width: `${document.progress}%` }} />
                      </span>
                    )}
                  </span>
                </button>

                <button
                  className="remove-document-button"
                  type="button"
                  aria-label={`Remove ${document.name}`}
                  title={`Remove ${document.name}`}
                  onClick={() => onDocumentRemove(document.id)}
                >
                  <svg className="remove-document-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m7 7 10 10M17 7 7 17" />
                  </svg>
                </button>
              </div>
            );
          })}
          {documents.length === 0 && (
            <p className="history-empty">No documents uploaded yet.</p>
          )}
        </div>
      </section>

      <div className="sidebar-account">
        <div className="account-avatar" aria-hidden="true">
          {user.name.trim().charAt(0).toUpperCase()}
        </div>
        <div className="account-details">
          <span className="account-name">{user.name}</span>
          <span className="account-email">{user.email}</span>
        </div>
        <button
          className="account-logout-button"
          type="button"
          onClick={() => setIsSignOutOpen(true)}
          aria-label="Sign out"
          title="Sign out"
        >
          <svg className="logout-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M10 17l5-5-5-5M15 12H3" />
            <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
          </svg>
        </button>
      </div>

      {isSignOutOpen && (
        <div
          className="signout-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsSignOutOpen(false);
          }}
        >
          <section
            className="signout-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signout-title"
            aria-describedby="signout-description"
          >
            <div className="signout-icon" aria-hidden="true">
              <svg className="logout-icon" viewBox="0 0 24 24" fill="none">
                <path d="M10 17l5-5-5-5M15 12H3" />
                <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
              </svg>
            </div>
            <h2 id="signout-title">Sign out of ansAce?</h2>
            <p id="signout-description">
              You'll need to sign in again to continue working with your documents.
            </p>
            <div className="signout-actions">
              <button
                className="signout-cancel"
                type="button"
                onClick={() => setIsSignOutOpen(false)}
              >
                Cancel
              </button>
              <button
                className="signout-confirm"
                type="button"
                onClick={() => {
                  setIsSignOutOpen(false);
                  onLogout();
                }}
              >
                Sign out
              </button>
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}

export default Sidebar;

import { useEffect, useRef, useState } from "react";
import Sidebar from "./components/sidebar";
import ChatWindow from "./components/ChatWindow";
import AuthScreen from "./components/AuthScreen";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  `http://${window.location.hostname || "localhost"}:8000`;

function getGreetingReply(message) {
  const greeting = message
    .toLowerCase()
    .trim()
    .replace(/[!.,?]+$/g, "")
    .replace(/\s+/g, " ");

  const replies = new Map([
    ["hi", "Hi! 👋 How can I help you with your document today?"],
    ["hello", "Hello! 👋 Upload a document or ask me a question about one."],
    ["hey", "Hey! 👋 What would you like to know about your document?"],
    ["hi there", "Hi there! 👋 How can I help you today?"],
    ["hello there", "Hello! 👋 How can I help you today?"],
    ["good morning", "Good morning! ☀️ How can I help you with your document?"],
    ["good afternoon", "Good afternoon! How can I help you with your document?"],
    ["good evening", "Good evening! How can I help you with your document?"],
  ]);

  return replies.get(greeting) || null;
}

function App() {
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia("(max-width: 599px)").matches,
  );

  // Documents state
  const [documents, setDocuments] = useState([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");

  // Chat messages state
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    !window.matchMedia("(max-width: 599px)").matches,
  );
  const [chatId, setChatId] = useState(0);
  const chatIdRef = useRef(0);
  const [chatHistory, setChatHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [historyOwnerId, setHistoryOwnerId] = useState(null);
  const currentChatIdRef = useRef(null);
  const chatDocumentIdRef = useRef(null);

  useEffect(() => {
    if (!user) {
      setChatHistory([]);
      setHistoryOwnerId(null);
      return;
    }

    const storageKey = `ansace_chat_history_${user.id}`;
    try {
      const savedHistory = JSON.parse(localStorage.getItem(storageKey) || "[]");
      setChatHistory(Array.isArray(savedHistory) ? savedHistory : []);
    } catch {
      setChatHistory([]);
    }
    setHistoryOwnerId(user.id);
  }, [user]);

  useEffect(() => {
    if (user && historyOwnerId === user.id) {
      localStorage.setItem(
        `ansace_chat_history_${user.id}`,
        JSON.stringify(chatHistory),
      );
    }
  }, [chatHistory, historyOwnerId, user]);

  useEffect(() => {
    if (!user || !currentChatId || messages.length === 0) return;

    setChatHistory((history) => {
      const existingChat = history.find((chat) => chat.id === currentChatId);
      const firstQuestion = messages.find(
        (message) => message.role === "user" && !getGreetingReply(message.content),
      );
      const title = firstQuestion?.content || existingChat?.title || "New chat";
      const updatedChat = {
        id: currentChatId,
        title,
        documentId: Array.isArray(chatDocumentIdRef.current)
          ? chatDocumentIdRef.current[0] ?? null
          : chatDocumentIdRef.current,
        documentIds: Array.isArray(chatDocumentIdRef.current)
          ? chatDocumentIdRef.current
          : [chatDocumentIdRef.current].filter(Boolean),
        messages,
        updatedAt: new Date().toISOString(),
      };

      return [updatedChat, ...history.filter((chat) => chat.id !== currentChatId)];
    });
  }, [messages, currentChatId, user]);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 599px)");
    const syncLayout = () => {
      setIsMobile(mobileQuery.matches);
      setIsSidebarOpen(!mobileQuery.matches);
    };

    mobileQuery.addEventListener("change", syncLayout);
    return () => mobileQuery.removeEventListener("change", syncLayout);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          credentials: "include",
        });

        if (response.status === 401) {
          return;
        }

        const sessionUser = await response.json();
        if (!response.ok) {
          throw new Error(sessionUser?.detail || "Could not restore your session.");
        }

        const documentsResponse = await fetch(`${API_BASE_URL}/documents`, {
          credentials: "include",
        });
        const userDocuments = await documentsResponse.json().catch(() => null);
        if (!documentsResponse.ok || !Array.isArray(userDocuments)) {
          throw new Error(
            userDocuments?.detail || "Could not load your documents.",
          );
        }

        if (!cancelled) {
          setUser(sessionUser);
          setDocuments(userDocuments);
          setActiveDocumentId(userDocuments[0]?.id ?? null);
          setSelectedDocumentIds(userDocuments[0]?.id ? [userDocuments[0].id] : []);
        }
      } catch (error) {
        if (!cancelled) {
          setAuthError(
            error instanceof Error
              ? error.message
              : "Could not connect to the authentication service.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsAuthLoading(false);
        }
      }
    };

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthenticate = async (action, credentials) => {
    setIsAuthSubmitting(true);
    setAuthError("");

    try {
      const response = await fetch(`${API_BASE_URL}/auth/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(credentials),
      });
      const authenticatedUser = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          authenticatedUser?.detail || `Sign-in failed (HTTP ${response.status}).`,
        );
      }

      const documentsResponse = await fetch(`${API_BASE_URL}/documents`, {
        credentials: "include",
      });
      const userDocuments = await documentsResponse.json().catch(() => null);
      if (!documentsResponse.ok || !Array.isArray(userDocuments)) {
        throw new Error(userDocuments?.detail || "Could not load your documents.");
      }

      setUser(authenticatedUser);
      setDocuments(userDocuments);
      setActiveDocumentId(userDocuments[0]?.id ?? null);
      setSelectedDocumentIds(userDocuments[0]?.id ? [userDocuments[0].id] : []);
      setMessages([]);
      setAuthError("");
    } catch (error) {
      setAuthError(
        error instanceof TypeError
          ? `Could not connect to the backend at ${API_BASE_URL}.`
          : error instanceof Error
            ? error.message
            : "An unexpected authentication error occurred.",
      );
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setAuthError("");
    try {
      const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Could not sign out.");
      }

      chatIdRef.current += 1;
      currentChatIdRef.current = null;
      chatDocumentIdRef.current = null;
      setCurrentChatId(null);
      setChatHistory([]);
      setUser(null);
      setDocuments([]);
      setMessages([]);
      setActiveDocumentId(null);
      setSelectedDocumentIds([]);
      setIsThinking(false);
    } catch (error) {
      setAuthError(
        error instanceof TypeError
          ? `Could not connect to the backend at ${API_BASE_URL}.`
          : error instanceof Error
            ? error.message
            : "An unexpected sign-out error occurred.",
      );
    }
  };

  // Currently selected/active document
  const [activeDocumentId, setActiveDocumentId] = useState(null);

  // --------------------------------------------------
  // Upload document to FastAPI
  // --------------------------------------------------
  const handleDocumentUpload = async (file) => {
    const temporaryId = `${file.name}-${file.lastModified}-${Date.now()}`;

    // Add document immediately so the UI can show uploading state
    setDocuments((currentDocuments) => [
      ...currentDocuments,
      {
        id: temporaryId,
        name: file.name,
        status: "uploading",
        progress: 0,
      },
    ]);

    try {
      // Show initial upload progress
      setDocuments((currentDocuments) =>
        currentDocuments.map((document) =>
          document.id === temporaryId
            ? {
                ...document,
                progress: 20,
              }
            : document,
        ),
      );

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail || `Document upload failed (HTTP ${response.status}).`,
        );
      }

      if (!data?.document_id || !data?.filename) {
        throw new Error("The backend returned an invalid upload response.");
      }

      setDocuments((currentDocuments) =>
        currentDocuments.map((document) =>
          document.id === temporaryId
            ? {
                ...document,
                progress: 60,
                status: "processing",
              }
            : document,
        ),
      );

      // Backend has finished processing and indexing
      setDocuments((currentDocuments) =>
        currentDocuments.map((document) =>
          document.id === temporaryId
            ? {
                ...document,
                id: data.document_id,
                name: data.filename,
                status: "ready",
                progress: 100,
                documentId: data.document_id,
                chunks: data.chunks,
              }
            : document,
        ),
      );

      // Make the newly uploaded document active
      setActiveDocumentId(data.document_id);
      setSelectedDocumentIds((currentIds) => [...new Set([...currentIds, data.document_id])]);
      chatDocumentIdRef.current = [...new Set([...(chatDocumentIdRef.current || []), data.document_id])];

      console.log("Document uploaded successfully:", data);
    } catch (error) {
      console.error("Upload error:", error);
      const errorMessage =
        error instanceof TypeError
          ? `Could not connect to the backend at ${API_BASE_URL}. Make sure FastAPI is running.`
          : error instanceof Error
            ? error.message
            : "An unexpected error occurred while uploading the document.";

      setDocuments((currentDocuments) =>
        currentDocuments.map((document) =>
          document.id === temporaryId
            ? {
                ...document,
                status: "error",
                error: errorMessage,
              }
            : document,
        ),
      );
    }
  };

  // --------------------------------------------------
  // Remove document from frontend
  // --------------------------------------------------
  const handleDocumentRemove = async (documentId) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/documents/${encodeURIComponent(documentId)}`,
        { method: "DELETE", credentials: "include" },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Could not remove the document.");
      }

      setDocuments((currentDocuments) =>
        currentDocuments.filter(
          (document) => document.id !== documentId,
        ),
      );
      setSelectedDocumentIds((currentIds) => currentIds.filter((id) => id !== documentId));

      if (activeDocumentId === documentId) {
        setActiveDocumentId(null);
      }
    } catch (error) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: Date.now(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Could not remove the document.",
          timestamp: new Date().toISOString(),
          sources: [],
        },
      ]);
    }
  };

  // --------------------------------------------------
  // Send question to FastAPI
  // --------------------------------------------------
  const handleSendMessage = async (message) => {
    if (!message.trim()) return;

    const greetingReply = getGreetingReply(message);
    if (greetingReply) {
      const timestamp = new Date().toISOString();
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: Date.now(),
          role: "user",
          content: message,
          timestamp,
        },
        {
          id: Date.now() + 1,
          role: "assistant",
          content: greetingReply,
          timestamp,
          sources: [],
        },
      ]);
      return;
    }

    const selectedIds = selectedDocumentIds;

    if (selectedIds.length === 0) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: Date.now(),
          role: "user",
          content: message,
          timestamp: new Date().toISOString(),
        },
        {
          id: Date.now() + 1,
          role: "assistant",
          content: "Select at least one ready document so I can answer your question.",
          timestamp: new Date().toISOString(),
          sources: [],
        },
      ]);

      return;
    }

    if (!currentChatIdRef.current) {
      const newChatId = crypto.randomUUID();
      currentChatIdRef.current = newChatId;
      chatDocumentIdRef.current = selectedIds;
      setCurrentChatId(newChatId);
    }

    const messageChatId = chatIdRef.current;
    const userMessageId = Date.now();

    // Add user's message immediately
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: userMessageId,
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      },
    ]);

    setIsThinking(true);

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          question: message,
          document_ids: selectedIds,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail || `Chat request failed (HTTP ${response.status}).`,
        );
      }

      // Ignore an old response if user started a new chat
      if (messageChatId !== chatIdRef.current) {
        return;
      }

      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content:
          data.answer ||
          "I couldn't generate an answer from the uploaded document.",
        timestamp: new Date().toISOString(),
        sources: data.sources || [],
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        assistantMessage,
      ]);
    } catch (error) {
      console.error("Chat error:", error);

      if (messageChatId !== chatIdRef.current) {
        return;
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: Date.now() + 1,
          role: "assistant",
          content:
            error instanceof TypeError
              ? `Could not connect to the backend at ${API_BASE_URL}. Make sure FastAPI is running.`
              : error instanceof Error
                ? error.message
                : "An unexpected error occurred while processing your question.",
          timestamp: new Date().toISOString(),
          sources: [],
        },
      ]);
    } finally {
      if (messageChatId === chatIdRef.current) {
        setIsThinking(false);
      }
    }
  };

  // --------------------------------------------------
  // Regenerate assistant response
  // --------------------------------------------------
  const handleRegenerate = (assistantId) => {
    const assistantIndex = messages.findIndex(
      (message) => message.id === assistantId,
    );

    if (assistantIndex === -1) return;

    const previousUserMessage =
      messages[assistantIndex - 1];

    if (
      !previousUserMessage ||
      previousUserMessage.role !== "user"
    ) {
      return;
    }

    setMessages((currentMessages) =>
      currentMessages.filter(
        (message) => message.id !== assistantId,
      ),
    );

    handleSendMessage(previousUserMessage.content);
  };

  // --------------------------------------------------
  // Start new chat
  // --------------------------------------------------
  const handleNewChat = () => {
    chatIdRef.current += 1;

    setChatId(chatIdRef.current);
    currentChatIdRef.current = null;
    chatDocumentIdRef.current = selectedDocumentIds;
    setCurrentChatId(null);
    setMessages([]);
    setIsThinking(false);
  };

  const handleToggleDocument = (documentId) => {
    const isSelected = selectedDocumentIds.includes(documentId);
    const nextIds = isSelected
      ? selectedDocumentIds.filter((id) => id !== documentId)
      : [...selectedDocumentIds, documentId];
    setSelectedDocumentIds(nextIds);
    if (!isSelected) setActiveDocumentId(documentId);
    chatDocumentIdRef.current = nextIds;
  };

  const handleSelectAllDocuments = () => {
    const ids = documents.filter((document) => document.status === "ready").map((document) => document.id);
    setSelectedDocumentIds(ids);
    setActiveDocumentId(ids[0] ?? null);
    chatDocumentIdRef.current = ids;
  };

  const handleClearDocumentSelection = () => {
    setSelectedDocumentIds([]);
    chatDocumentIdRef.current = [];
  };

  const handleSelectDocument = (documentId) => {
    const ids = Array.isArray(documentId) ? documentId : [documentId];
    setSelectedDocumentIds(ids.filter(Boolean));
    const primaryId = ids[0] ?? null;
    if (primaryId !== activeDocumentId) {
      chatIdRef.current += 1;
      setChatId(chatIdRef.current);
      currentChatIdRef.current = null;
      chatDocumentIdRef.current = ids.filter(Boolean);
      setCurrentChatId(null);
      setMessages([]);
      setIsThinking(false);
    }
    setActiveDocumentId(primaryId);
  };

  const handleSelectChat = (chat) => {
    chatIdRef.current += 1;
    setChatId(chatIdRef.current);
    currentChatIdRef.current = chat.id;
    chatDocumentIdRef.current = chat.documentIds?.length
      ? chat.documentIds
      : [chat.documentId].filter(Boolean);
    setCurrentChatId(chat.id);
    const chatDocumentIds = chat.documentIds?.length ? chat.documentIds : [chat.documentId].filter(Boolean);
    setSelectedDocumentIds(chatDocumentIds);
    setActiveDocumentId(chatDocumentIds[0] ?? null);
    setMessages(chat.messages);
    setIsThinking(false);
    if (isMobile) setIsSidebarOpen(false);
  };

  if (isAuthLoading) {
    return (
      <main className="auth-page">
        <p className="auth-loading">Loading your account...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticate={handleAuthenticate}
        error={authError}
        isSubmitting={isAuthSubmitting}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        isOpen={isSidebarOpen || !isMobile}
        user={user}
        onClose={() => setIsSidebarOpen(false)}
        documents={documents}
        chatHistory={chatHistory}
        currentChatId={currentChatId}
        activeDocumentId={activeDocumentId}
        selectedDocumentIds={selectedDocumentIds}
        onDocumentUpload={handleDocumentUpload}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onSelectDocument={handleSelectDocument}
        onToggleDocument={handleToggleDocument}
        onSelectAllDocuments={handleSelectAllDocuments}
        onClearDocumentSelection={handleClearDocumentSelection}
        onDocumentRemove={handleDocumentRemove}
        onLogout={handleLogout}
      />

      <main className="main-content">
        <header className="header">
          <button
            className="menu-button"
            type="button"
            aria-label="Open documents menu"
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen(true)}
          >
            ☰
          </button>

          <div className="mobile-brand-wordmark" aria-label="ansAce">
            ansAce
          </div>
        </header>

        {isMobile && isSidebarOpen && (
          <button
            className="sidebar-backdrop"
            type="button"
            aria-label="Close documents menu"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <ChatWindow
          key={chatId}
          messages={messages}
          isThinking={isThinking}
          selectedDocuments={documents.filter((document) => selectedDocumentIds.includes(document.id))}
          onToggleDocument={handleToggleDocument}
          onSendMessage={handleSendMessage}
          onDocumentUpload={handleDocumentUpload}
          onRegenerate={handleRegenerate}
        />
      </main>
    </div>
  );
}

export default App;

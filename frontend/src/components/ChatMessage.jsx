import { useState } from "react";

function parseTableCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = parseTableCells(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderInlineText(text) {
  // Support **bold** and `code`
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(<code className="inline-code" key={match.index}>{token.slice(1, -1)}</code>);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function renderMessage(message, isUser) {
  if (isUser) {
    return message;
  }

  const lines = message.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      i++;
      continue;
    }

    // Markdown Table
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = parseTableCells(line);
      const rows = [];
      i += 2;

      while (i < lines.length && lines[i].trim().includes("|")) {
        rows.push(parseTableCells(lines[i]));
        i++;
      }

      blocks.push(
        <div className="message-table-wrapper" key={`table-${i}`}>
          <table className="message-table">
            <thead>
              <tr>
                {headers.map((header, colIdx) => (
                  <th key={`header-${colIdx}`}>{renderInlineText(header)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={`row-${rowIdx}`}>
                  {headers.map((_, colIdx) => (
                    <td key={`cell-${colIdx}`}>
                      {renderInlineText(row[colIdx] || "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Heading 3: ### Document Name / Heading
    if (line.startsWith("### ")) {
      const headingContent = line.slice(4).trim();
      const isDocHeader = headingContent.includes("📄") || headingContent.toLowerCase().includes(".pdf") || headingContent.toLowerCase().includes(".docx") || headingContent.toLowerCase().includes(".txt");
      blocks.push(
        <div className={`message-heading-box ${isDocHeader ? "doc-header" : "synthesis-header"}`} key={`h3-${i}`}>
          <h3 className="message-h3">{renderInlineText(headingContent)}</h3>
        </div>
      );
      i++;
      continue;
    }

    // Heading 2: ## Heading
    if (line.startsWith("## ")) {
      blocks.push(
        <h2 className="message-h2" key={`h2-${i}`}>
          {renderInlineText(line.slice(3).trim())}
        </h2>
      );
      i++;
      continue;
    }

    // Heading 1: # Heading
    if (line.startsWith("# ")) {
      blocks.push(
        <h1 className="message-h1" key={`h1-${i}`}>
          {renderInlineText(line.slice(2).trim())}
        </h1>
      );
      i++;
      continue;
    }

    // Bullet lists: lines starting with - or *
    if (/^[-*]\s+/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*]\s+/, "");
        listItems.push(itemText);
        i++;
      }
      blocks.push(
        <ul className="message-bullet-list" key={`list-${i}`}>
          {listItems.map((item, itemIdx) => (
            <li key={`li-${itemIdx}`}>{renderInlineText(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p className="message-paragraph" key={`p-${i}`}>
        {renderInlineText(line)}
      </p>
    );
    i++;
  }

  return blocks;
}

function ChatMessage({
  role,
  message,
  sources = [],
  timestamp,
  onRegenerate,
}) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };


  return (
    <div className={`message-row ${isUser ? "user" : "assistant"}`}>
      <div className="message-avatar">
        {isUser ? "👤" : "🤖"}
      </div>

      <div className="message-content">
        <div className="message-bubble">
          {renderMessage(message, isUser)}

        </div>

        <div className="message-meta">
          <time dateTime={timestamp}>
            {new Date(timestamp).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
          {!isUser && (
            <div className="message-actions">
              <button type="button" onClick={handleCopy}>
                {copied ? "Copied" : "Copy"}
              </button>
              {onRegenerate && (
                <button type="button" onClick={onRegenerate}>
                  Regenerate
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatMessage;
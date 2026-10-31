function FileUpload({ onDocumentUpload }) {
  const handleFileChange = (event) => {
    const file = event.target.files[0];

    if (!file) return;

    onDocumentUpload(file);

    // Allow selecting the same file again
    event.target.value = "";
  };

  return (
    <div className="upload-container">
      <label htmlFor="file-upload" className="upload-button">
        📤 Upload Document
      </label>

      <input
        id="file-upload"
        type="file"
        accept=".pdf,.txt,.docx"
        onChange={handleFileChange}
        hidden
      />

      <p className="upload-hint">
        PDF, TXT or DOCX
      </p>
    </div>
  );
}

export default FileUpload;
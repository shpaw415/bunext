import type { ReactNode } from "react";
import "../internal/globals";

export function ErrorFallback({ error }: { error: Error }): ReactNode {
  return (
    <div className="bunext-error-fallback-wrapper" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", fontFamily: "monospace", padding: "20px" }}>
      <h1 style={{ color: "#e74c3c", marginBottom: "20px" }}>Something went wrong</h1>
      <div style={{
        backgroundColor: "#2c3e50",
        color: "#ecf0f1",
        padding: "20px",
        borderRadius: "8px",
        maxWidth: "80%",
        overflow: "auto",
        border: "2px solid #e74c3c"
      }}>
        <div style={{ marginBottom: "15px" }}>
          <strong style={{ color: "#3498db" }}>Error:</strong>
          <pre style={{ margin: "5px 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{error?.message}</pre>
        </div>
        <div style={{ marginBottom: "15px" }}>
          <strong style={{ color: "#3498db" }}>Stack Trace:</strong>
          <pre style={{ margin: "5px 0", whiteSpace: "pre-wrap", fontSize: "12px", lineHeight: "1.4" }}>{error?.stack}</pre>
        </div>
        <div>
          <strong style={{ color: "#3498db" }}>Additional Info:</strong>
          <pre style={{ margin: "5px 0", whiteSpace: "pre-wrap" }}>{error?.cause ? JSON.stringify(error?.cause, null, 2) : "No additional information available."}</pre>
        </div>
      </div>
      <p style={{ marginTop: "20px", color: "#7f8c8d" }}>
        Please check the server logs for more details.
      </p>
    </div>
  );
}

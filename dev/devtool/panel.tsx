"use client";

import { navigate } from "../../internal/router";
import { ClientSendWSMessage } from "../hotServer";
import { DevWebSocketContext } from "../dev";
import "./panel.css";
import { useEffect, useMemo, useState, useRef, useCallback, useContext } from "react";


// --- Utility: persist width ---
function usePanelWidth(defaultWidth = 420) {
  const [width, setWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = Number(localStorage.getItem("bunext-panel-width"));
      if (!Number.isNaN(saved) && saved > 240) return saved;
    }
    return defaultWidth;
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("bunext-panel-width", String(width));
    }
  }, [width]);
  return [width, setWidth] as const;
}

// --- Main Panel ---
export default function DevToolPanel() {
  const [panelVisible, setPanelVisible] = useState(true);
  // Customization states
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [fontSize, setFontSize] = useState(1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        setPanelVisible(v => !v);
        e.preventDefault();
      }
      if (e.key === "Escape" && panelVisible) {
        setPanelVisible(false);
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panelVisible]);

  return (
    <>
      <link href="/.bunext/react-ssr/hydrate.css" rel="stylesheet" />
      <Panel
        onClose={() => setPanelVisible(false)}
        visible={panelVisible}
        theme={theme}
        fontSize={fontSize}
        setTheme={setTheme}
        setFontSize={setFontSize}
      />
      {!panelVisible && (
        <FloatingButton onClick={() => setPanelVisible(true)} />
      )}
    </>
  );
}

// --- Floating Button ---
function FloatingButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="bunext-toggle-btn"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      title="Open Bunext Devtools (Ctrl+Shift+D)"
      aria-label="Open Bunext Devtools"
    >
      🛠
    </button>
  );
}

// --- Panel ---
function Panel({
  onClose,
  visible,
  theme,
  fontSize,
  setTheme,
  setFontSize,
}: {
  onClose: () => void;
  visible: boolean;
  theme: "dark" | "light";
  fontSize: number;
  setTheme: (t: "dark" | "light") => void;
  setFontSize: (f: number) => void;
}) {
  const [routes, setRoutes] = useState<Array<string>>([]);
  const [filter, setFilter] = useState("");
  const [serverPropsFilter, setServerPropsFilter] = useState("");
  const [perf, setPerf] = useState<{ render?: number; hydration?: number }>({});
  const [panelWidth, setPanelWidth] = usePanelWidth(420);
  const [envFilter, setEnvFilter] = useState("");
  const [routeHistory, setRouteHistory] = useState<string[]>([]);
  const resizing = useRef(false);
  const resizeStart = useRef({ x: 0, width: 420 });

  const env = useMemo(() => typeof window === "undefined" ? "" : process.env ? process.env : {}, []);

  // Clamp width on window resize
  useEffect(() => {
    const handleResize = () => {
      const vw = window.innerWidth;
      setPanelWidth(w => Math.max(280, Math.min(w, Math.floor(vw * 0.9))));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const filteredServerProps = useMemo(() => {
    const props = globalThis.__SERVERSIDE_PROPS__;
    const filter = serverPropsFilter.toLowerCase();
    if (typeof props === "string") {
      return filter ? (props.toLowerCase().includes(filter) ? props : "") : props;
    }
    if (Array.isArray(props)) {
      return filter
        ? props.filter(item => JSON.stringify(item).toLowerCase().includes(filter))
        : props;
    }
    if (props && typeof props === "object") {
      return filter
        ? Object.fromEntries(
          Object.entries(props).filter(
            ([key, value]) =>
              key.toLowerCase().includes(filter) ||
              String(value).toLowerCase().includes(filter)
          )
        )
        : props;
    }
    return props;
  }, [serverPropsFilter, globalThis.__SERVERSIDE_PROPS__]);

  const filteredEnv = useMemo(() => {
    if (!envFilter) return env;
    if (typeof env !== "object" || !env) return env;
    return Object.fromEntries(
      Object.entries(env).filter(([key, value]) =>
        key.toLowerCase().includes(envFilter.toLowerCase()) ||
        String(value).toLowerCase().includes(envFilter.toLowerCase())
      )
    );
  }, [env, envFilter]);

  useEffect(() => {
    setRoutes(Object.keys(globalThis.__ROUTES__).filter((route) => !route.endsWith("layout")).sort());
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPerf({ hydration: performance.now() });
    }
  }, []);

  // --- Horizontal Resize (left edge) ---
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    resizing.current = true;
    resizeStart.current = { x: e.clientX, width: panelWidth };
    document.addEventListener("mousemove", onResizeMouseMove);
    document.addEventListener("mouseup", onResizeMouseUp);
  }, [panelWidth]);
  const onResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!resizing.current) return;
    const dx = resizeStart.current.x - e.clientX; // dragging left increases width
    const vw = window.innerWidth;
    const min = 280;
    const max = Math.floor(vw * 0.95);
    const next = Math.max(min, Math.min(resizeStart.current.width + dx, max));
    setPanelWidth(next);
  }, [setPanelWidth]);
  const onResizeMouseUp = useCallback(() => {
    resizing.current = false;
    document.removeEventListener("mousemove", onResizeMouseMove);
    document.removeEventListener("mouseup", onResizeMouseUp);
  }, [onResizeMouseMove]);

  function handleRouteNavigate(route: string) {
    const params = getRouteParams(route);
    let finalRoute = route;

    if (params.length === 0) {
      // No parameters, navigate directly
      navigate(finalRoute as any);
      setRouteHistory(h => [finalRoute, ...h.filter(r => r !== finalRoute)].slice(0, 10));
      return;
    }

    // Handle parameterized routes
    for (const param of params) {
      const value = window.prompt(`Enter value for "${param}":`);
      if (value === null) {
        // User clicked cancel
        return;
      }
      if (!value.trim()) {
        alert(`Parameter "${param}" cannot be empty`);
        return;
      }
      finalRoute = finalRoute.replace(`[${param}]`, encodeURIComponent(value.trim()));
    }

    navigate(finalRoute as any);
    setRouteHistory(h => [finalRoute, ...h.filter(r => r !== finalRoute)].slice(0, 10));
  }

  return (
    <div
      className={`bunext-devtools-panel bunext-theme-${theme}${visible ? "" : " bunext-devtools-panel-hidden"}`}
      style={{
        width: panelWidth,
        height: "100vh",
        fontSize: `${fontSize}em`,
      }}
    >
      <header className="bunext-panel-header">
        <span>🛠 Bunext Devtools</span>
        <button className="bunext-panel-close-btn" onClick={onClose}>×</button>
      </header>
      <div className="bunext-panel-content">
        <CollapsibleSection title="🔍 Available Routes">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="text"
              placeholder="Filter routes…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="bunext-filter-input"
            />
            {/* Always render the clear button, but disable it if input is empty */}
            <button
              className={`bunext-filter-clear-btn${!filter ? " bunext-filter-clear-btn-blur" : ""}`}
              title="Clear filter"
              onClick={() => filter && setFilter("")}
              disabled={!filter}
            >
              ×
            </button>
          </div>
          <ul className="bunext-routes-list">
            {routes
              .filter(route => route.toLowerCase().includes(filter.toLowerCase()))
              .map((route) => (
                <li
                  key={route}
                  className="bunext-route-item"
                  onClick={() => handleRouteNavigate(route)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRouteNavigate(route);
                    }
                  }}
                  tabIndex={0}
                  onMouseEnter={e => e.currentTarget.classList.add("bunext-route-item-hover")}
                  onMouseLeave={e => e.currentTarget.classList.remove("bunext-route-item-hover")}
                  onFocus={e => e.currentTarget.classList.add("bunext-route-item-hover")}
                  onBlur={e => e.currentTarget.classList.remove("bunext-route-item-hover")}
                >
                  {route}
                </li>
              ))}
          </ul>
        </CollapsibleSection>

        <CollapsibleSection title="🕓 Route History">
          <div className="bunext-flex-row" style={{ marginBottom: 8 }}>
            <button
              className={`bunext-filter-clear-btn${routeHistory.length === 0 ? " bunext-filter-clear-btn-blur" : ""}`}
              title="Clear navigation history"
              onClick={() => setRouteHistory([])}
              disabled={routeHistory.length === 0}
            >
              × Clear History
            </button>
          </div>
          <ul className="bunext-routes-list">
            {routeHistory.map(route => (
              <li
                key={route}
                className="bunext-route-item"
                onClick={() => navigate(route as any)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(route as any);
                  }
                }}
                tabIndex={0}
                onMouseEnter={e => e.currentTarget.classList.add("bunext-route-item-hover")}
                onMouseLeave={e => e.currentTarget.classList.remove("bunext-route-item-hover")}
                onFocus={e => e.currentTarget.classList.add("bunext-route-item-hover")}
                onBlur={e => e.currentTarget.classList.remove("bunext-route-item-hover")}
              >
                {route}
              </li>
            ))}
          </ul>
        </CollapsibleSection>

        <CollapsibleSection title={<>🌎 Environnement <CopyButton text={JSON.stringify(filteredEnv, null, 2)} /></>}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="text"
              className="bunext-filter-input"
              placeholder="Search env…"
              value={envFilter}
              onChange={e => setEnvFilter(e.target.value)}
            />
            <button
              className={`bunext-filter-clear-btn${!envFilter ? " bunext-filter-clear-btn-blur" : ""}`}
              title="Clear"
              onClick={() => setEnvFilter("")}
              disabled={!envFilter}
            >
              ×
            </button>
          </div>
          <pre className="bunext-server-props-pre">
            <CodeBlockViewer data={filteredEnv} />
          </pre>
        </CollapsibleSection>

        {globalThis.__SERVERSIDE_PROPS__ as any && (
          <CollapsibleSection title="📦 Server Props">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="text"
                className="bunext-filter-input"
                placeholder="Search server props…"
                value={serverPropsFilter}
                onChange={e => setServerPropsFilter(e.target.value)}
              />
              {serverPropsFilter && (
                <button
                  className={`bunext-filter-clear-btn${!serverPropsFilter ? " bunext-filter-clear-btn-blur" : ""}`}
                  title="Clear"
                  onClick={() => serverPropsFilter && setServerPropsFilter("")}
                  disabled={!serverPropsFilter}
                >
                  ×
                </button>
              )}
            </div>
            <pre className="bunext-server-props-pre">
              <CodeBlockViewer data={filteredServerProps} />
            </pre>
          </CollapsibleSection>
        )}

        <CollapsibleSection title="⏱ Performance Metrics">
          <ul>
            <li>Hydration: {perf.hydration ? perf.hydration.toFixed(2) + "ms" : "n/a"}</li>
          </ul>
        </CollapsibleSection>

        <CollapsibleSection title="⚙️ Settings">
          <div className="bunext-flex-row" style={{ gap: 16 }}>
            <label>
              Theme:&nbsp;
              <select
                value={theme}
                onChange={e => setTheme(e.target.value as "dark" | "light")}
                style={{ marginRight: 12 }}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <label>
              Font size:&nbsp;
              <input
                type="range"
                min={0.8}
                max={1.4}
                step={0.01}
                value={fontSize}
                onChange={e => setFontSize(Number(e.target.value))}
                style={{ verticalAlign: "middle" }}
              />
              &nbsp;{fontSize.toFixed(2)}em
            </label>
          </div>
        </CollapsibleSection>
      </div>
      <div className="bunext-panel-resize-handle" onMouseDown={onResizeMouseDown}>
        <svg width="10" height="40" viewBox="0 0 10 40">
          <rect x="3" y="8" width="2" height="24" fill="#888" />
          <rect x="6" y="8" width="2" height="24" fill="#888" />
        </svg>
      </div>
    </div>
  );
}

/* --- CopyButton --- */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopied(true);
      setError(false);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setError(true);
      setTimeout(() => setError(false), 1200);
    }
  };

  return (
    <button
      className={`bunext-copy-button${error ? ' bunext-copy-error' : ''}`}
      onClick={handleCopy}
      title={error ? "Copy failed" : "Copy to clipboard"}
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <rect x="5" y="5" width="10" height="12" rx="2" stroke="#ccc" strokeWidth="2" fill="none" />
        <rect x="3" y="3" width="10" height="12" rx="2" stroke="#888" strokeWidth="1" fill="none" />
      </svg>
      {copied && <span style={{ marginLeft: 6, fontSize: "0.9em", color: "green" }}>✓</span>}
      {error && <span style={{ marginLeft: 6, fontSize: "0.9em", color: "red" }}>✗</span>}
    </button>
  );
}

/* --- CollapsibleSection --- */
function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);

  // Calculate maxHeight for smooth transition
  const maxHeight = open && contentRef.current
    ? contentRef.current.scrollHeight + "px"
    : "0px";

  return (
    <div className="bunext-section">
      <h3
        className="bunext-section-title"
        onClick={() => setOpen(o => !o)}
        title={open ? "Collapse section" : "Expand section"}
      >
        <span style={{ marginRight: 8 }}>{open ? "▼" : "▶"}</span>
        {title}
      </h3>
      <div
        ref={contentRef}
        className="bunext-section-content"
        style={{
          maxHeight,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* --- CodeBlockViewer --- */
function CodeBlockViewer({ data }: { data: any }) {
  function renderLines(value: any, level = 0, collapsedBlocks: Record<string, boolean> = {}, path: string[] = []): Array<{ code: React.ReactNode; level: number }> {
    const lines: Array<{ code: React.ReactNode; level: number }> = [];
    const blockId = path.join(".");

    if (collapsedBlocks[blockId]) {
      if (Array.isArray(value)) {
        lines.push({
          code: (
            <span
              className="bunext-codeblock-toggle"
              onClick={() => setCollapsedBlocks(c => ({ ...c, [blockId]: false }))}
            >
              [{"…]"}
            </span>
          ),
          level,
        });
      } else if (typeof value === "object" && value !== null) {
        lines.push({
          code: (
            <span
              className="bunext-codeblock-toggle"
              onClick={() => setCollapsedBlocks(c => ({ ...c, [blockId]: false }))}
            >
              {"{"}…{"}"}
            </span>
          ),
          level,
        });
      }
      return lines;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      let node;
      if (typeof value === "string") node = <span className="bunext-json-string">"{value}"</span>;
      else if (typeof value === "number") node = <span className="bunext-json-number">{value}</span>;
      else if (typeof value === "boolean") node = <span className="bunext-json-boolean">{String(value)}</span>;
      else if (value === null) node = <span className="bunext-json-null">null</span>;
      lines.push({
        code: (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {node}
            <CopyButton text={String(value)} />
          </span>
        ),
        level
      });
      return lines;
    }

    if (Array.isArray(value)) {
      lines.push({
        code: (
          <span
            className="bunext-codeblock-toggle"
            onClick={() => setCollapsedBlocks(c => ({ ...c, [blockId]: true }))}
          >
            [
          </span>
        ),
        level,
      });
      value.forEach((item, i) => {
        const itemLines = renderLines(item, level + 1, collapsedBlocks, [...path, String(i)]);
        if (itemLines.length > 0) {
          const lastIdx = itemLines.length - 1;
          itemLines[lastIdx] = {
            ...itemLines[lastIdx],
            code: (
              <>
                {itemLines[lastIdx].code}
                {i < value.length - 1 ? <span>,</span> : null}
              </>
            ),
          };
        }
        lines.push(...itemLines);
      });
      lines.push({
        code: <span className="bunext-codeblock-toggle">]</span>,
        level,
      });
      return lines;
    }

    if (typeof value === "object" && value !== null) {
      lines.push({
        code: (
          <span
            className="bunext-codeblock-toggle"
            onClick={() => setCollapsedBlocks(c => ({ ...c, [blockId]: true }))}
          >
            {"{"}
          </span>
        ),
        level,
      });
      const keys = Object.keys(value);
      keys.forEach((key, i) => {
        const valLines = renderLines(value[key], level + 1, collapsedBlocks, [...path, key]);
        if (valLines.length > 0) {
          valLines[0] = {
            ...valLines[0],
            code: (
              <>
                <span className="bunext-json-key">"{key}"</span>
                <span>: </span>
                {valLines[0].code}
                {i < keys.length - 1 ? <span>,</span> : null}
              </>
            ),
          };
        }
        lines.push(...valLines);
      });
      lines.push({
        code: <span className="bunext-codeblock-toggle">{"}"}</span>,
        level,
      });
      return lines;
    }

    lines.push({ code: <span>{String(value)}</span>, level });
    return lines;
  }

  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<string, boolean>>({});
  const lines = renderLines(data, 0, collapsedBlocks);

  return (
    <div className="bunext-codeblock-viewer">
      {lines.map((line, idx) => (
        <div key={idx} className="bunext-codeblock-row">
          <span className="bunext-codeblock-linenum">{idx + 1}</span>
          <span className="bunext-codeblock-indent" style={{ paddingLeft: `${line.level * 12}px` }}>
            {line.code}
          </span>
        </div>
      ))}
    </div>
  );
}

function getRouteParams(route: string): string[] {
  // Matches [param] in the route and extracts the parameter name
  const matches = [...route.matchAll(/\[([^\]]+)\]/g)];
  return matches.map(m => m[1]).filter(param => param && param.trim());
}

function ActionSection() {
  const ws = useContext(DevWebSocketContext);
  const restartServer = useCallback(() => {
    ws && ClientSendWSMessage({ message: "reboot-server", ws });
  }, [ws]);

  return <CollapsibleSection title="⚙️ Actions">
    <button className="bunext-action-btn" onClick={restartServer}>
      Reboot Server
    </button>
  </CollapsibleSection>
}
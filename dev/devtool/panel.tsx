"use client";

import "./panel.css";
import { useEffect, useState } from "react";

function restartServer() {
  alert("[Devtools] Redémarrage du serveur (simulé)...");
}

function reloadPage() {
  alert("[Devtools] Reload forcé de la page (simulé)");
  location.reload();
}

export default function DevToolPanel() {
  const [routes, setRoutes] = useState<Array<string>>([]);
  const [devToolClass, setDevToolClass] = useState<Array<string>>([]);

  useEffect(() => {
    setRoutes(Object.keys(globalThis.__ROUTES__));
  }, []);

  return (
    <>
      <link href="/.bunext/react-ssr/hydrate.css" rel="stylesheet" />
      <div id="bunext-devtools" className={devToolClass.join(" ")}>
        <header>
          <span>🛠 Bunext Devtools</span>
          <button
            onClick={() => setDevToolClass((current) => [...current, "hidden"])}
          >
            ×
          </button>
        </header>
        <div className="content">
          <div className="section">
            <h3>🔍 Routes disponibles</h3>
            <ul>
              <li className="route-item">/ → Static</li>
              <li className="route-item">/about → SSR</li>
              <li className="route-item">/blog/[slug] → Dynamic</li>
            </ul>
          </div>

          <div className="section">
            <h3>📍 Page actuelle</h3>
            <p>/blog/hello-world</p>
            <p>Type : Dynamic (SSR)</p>
          </div>

          <div className="section">
            <h3>⚙️ Actions</h3>
            <button className="action" onClick={restartServer}>
              Redémarrer serveur dev
            </button>
            <button className="action" onClick={reloadPage}>
              Recharger la page
            </button>
          </div>

          <div className="section">
            <h3>📦 Server Props</h3>
            <pre>{`{ "title": "Hello World", "content": "Lorem ipsum..." }`}</pre>
          </div>

          <div className="section">
            <h3>⏱ Temps de rendu</h3>
            <ul>
              <li>Server Render: 54ms</li>
              <li>Hydration: 38ms</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

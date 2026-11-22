import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Exposed to CSS so platform-specific rendering (font smoothing, chrome
// offsets) can adapt without JS conditionals in every component.
document.documentElement.dataset.platform = window.electronAPI?.platform ?? "web";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// שמור token מה-hash לפני שReact רץ
const _hash = new URLSearchParams(window.location.hash.substring(1));
const _token = _hash.get("access_token");
if (_token) {
  sessionStorage.setItem("pending_token", _token);
  window.history.replaceState({}, document.title, window.location.pathname);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import { createRoot } from "react-dom/client";
import "./index.css";
import ChatWidget from "@/components/ChatWidget";

const CONTAINER_ID = "jonathan-chat-widget";

function mount() {
  // Guard against the embed script being included more than once.
  if (document.getElementById(CONTAINER_ID)) return;
  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  document.body.appendChild(container);
  createRoot(container).render(<ChatWidget />);
}

// document.body may not exist yet if the script is placed in <head> without defer.
if (document.body) {
  mount();
} else {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
}

import { createRoot } from "react-dom/client";
import "./index.css";
import ChatWidget from "@/components/ChatWidget";

// Create a container for the widget
const container = document.createElement("div");
container.id = "jonathan-chat-widget";
document.body.appendChild(container);

createRoot(container).render(<ChatWidget />);

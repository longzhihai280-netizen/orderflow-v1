import { ChatPanel } from "@/components/chat-panel";

export default function ChatPage() {
  return (
    <div className="wide-page chat-page">
      <div className="page-heading"><div><p className="eyebrow">Shared workspace</p><h1>Chat</h1><p className="muted">Messages, images and shared orders update in real time.</p></div></div>
      <ChatPanel />
    </div>
  );
}

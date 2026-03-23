import ChatWidget from "@/components/ChatWidget";

function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground">
      <div className="max-w-lg text-center">
        <h1 className="mb-4 text-3xl font-bold">Chat Widget Demo</h1>
        <p className="text-muted-foreground">
          Click the chat bubble in the bottom-right corner to try out the
          widget. This is a standalone demo — the widget can be embedded in any
          website.
        </p>
      </div>
      <ChatWidget />
    </div>
  );
}

export default App;

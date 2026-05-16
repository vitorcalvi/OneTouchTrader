import { Toaster } from "sonner";
import { MobileTradingPage } from "./pages/MobileTradingPage";

export default function App() {
  return (
    <>
      <MobileTradingPage />
      <Toaster
        position="bottom-right"
        theme="dark"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            color: "var(--tx-primary)",
            fontFamily: "Inter, system-ui, sans-serif",
          },
          classNames: {
            success: "border-bull/30",
            error: "border-bear/30",
            info: "border-accent/30",
          },
        }}
      />
    </>
  );
}

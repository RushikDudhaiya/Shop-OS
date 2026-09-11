import { useEffect, useState } from "react";
import { flushQueue, listPendingMutations } from "./queue";
import { api } from "@/lib/api";

export function SyncBanner() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function refreshCount() {
    try {
      const list = await listPendingMutations();
      setPending(list.length);
    } catch {
      setPending(0);
    }
  }

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void refreshCount();
    const t = window.setInterval(() => void refreshCount(), 5000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!online || pending === 0) return;
    void (async () => {
      setSyncing(true);
      setNote(null);
      try {
        const result = await flushQueue(async (m) => {
          await api(m.path, {
            method: m.method,
            body: JSON.stringify(m.body),
            headers: { "Content-Type": "application/json" },
          });
        });
        if (result.synced) setNote(`${result.synced} offline sale(s) synced`);
        if (result.failed) setNote(`${result.failed} sync fail — retry later`);
      } finally {
        setSyncing(false);
        await refreshCount();
      }
    })();
  }, [online, pending]);

  if (online && pending === 0 && !note) return null;

  return (
    <div
      className="border-b border-line bg-white/90 px-4 py-2 text-center text-sm"
      role="status"
    >
      {!online ? (
        <span className="font-medium text-gold-2">
          Offline — billing queue mein save hoga
        </span>
      ) : syncing ? (
        <span className="text-ink-muted">Syncing {pending}…</span>
      ) : pending > 0 ? (
        <span className="text-ink-muted">{pending} pending sync</span>
      ) : (
        <span className="text-success">{note}</span>
      )}
    </div>
  );
}

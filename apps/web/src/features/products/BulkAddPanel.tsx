import { useId, useRef, useState } from "react";
import { FileUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { getShopCatalog } from "@shop-os/shared";
import { Button, Input, Surface } from "@/components/ui";
import { api } from "@/lib/api";

type Row = { id: string; name: string; price: string };

type Props = {
  shopId: string;
  businessType?: string | null;
  onImported: () => void;
};

function newRow(): Row {
  return { id: crypto.randomUUID(), name: "", price: "" };
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowsToCsv(rows: Row[]): string {
  const body = rows
    .map((r) => ({
      name: r.name.trim(),
      price: r.price.trim(),
    }))
    .filter((r) => r.name && r.price && Number(r.price) >= 0)
    .map((r) => `${escapeCsv(r.name)},${r.price}`)
    .join("\n");
  return `name,sellingPrice\n${body}`;
}

export function BulkAddPanel({ shopId, businessType, onImported }: Props) {
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>(() => [newRow(), newRow(), newRow()]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const catalog = getShopCatalog(businessType);
  const placeholders = catalog.placeholders;

  const readyCount = rows.filter(
    (r) => r.name.trim() && r.price.trim() && Number(r.price) >= 0,
  ).length;

  async function importCsv(csv: string, successLabel: string) {
    setBusy(true);
    setMsg(null);
    setCelebrate(false);
    try {
      const preview = await api<{
        errors: string[];
      }>(`/api/shops/${shopId}/products/import/preview`, {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      if (preview.errors.length) {
        setMsg(preview.errors[0] ?? "Kuch galat hai — check karke try karo.");
        return;
      }
      const result = await api<{ createdCount: number; skipped: unknown[] }>(
        `/api/shops/${shopId}/products/import`,
        {
          method: "POST",
          body: JSON.stringify({ csv }),
        },
      );
      setMsg(
        result.createdCount > 0
          ? `${successLabel} ${result.createdCount} products add ho gaye!`
          : "Koi naya product nahi bana — shayad pehle se hain.",
      );
      if (result.createdCount > 0) {
        setCelebrate(true);
        setRows([newRow(), newRow(), newRow()]);
        onImported();
      }
    } catch {
      setMsg("Import fail ho gaya. Thodi der baad try karo.");
    } finally {
      setBusy(false);
    }
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  async function onFilePick(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    await importCsv(text, "File se");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Surface className="space-y-4 overflow-hidden">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gold/25 text-forest transition-transform ${
            celebrate ? "animate-bounce" : ""
          }`}
        >
          <Sparkles className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-tight text-ink">
            Bahut saare ek saath?
          </p>
          <p className="text-sm text-ink-muted">
            Naam + daam likho. Mobile pe bhi asaan — CSV ki tension nahi.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="hidden grid-cols-[1fr_7rem_2.5rem] gap-2 px-0.5 text-xs font-medium text-ink-muted sm:grid">
          <span>Product naam</span>
          <span>Bechne ka ₹</span>
          <span className="sr-only">Hatao</span>
        </div>
        {rows.map((row, index) => (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_5.5rem_2.5rem] items-end gap-2 sm:grid-cols-[1fr_7rem_2.5rem]"
          >
            <Input
              aria-label={`Product ${index + 1} naam`}
              placeholder={placeholders[index] ?? "Product naam"}
              value={row.name}
              onChange={(e) => updateRow(row.id, { name: e.target.value })}
              autoComplete="off"
              className="h-11"
            />
            <Input
              aria-label={`Product ${index + 1} price`}
              inputMode="decimal"
              placeholder="₹"
              value={row.price}
              onChange={(e) =>
                updateRow(row.id, {
                  price: e.target.value.replace(/[^\d.]/g, ""),
                })
              }
              className="h-11"
            />
            <button
              type="button"
              className="mb-0.5 flex size-11 items-center justify-center rounded-xl text-ink-muted hover:bg-danger-soft hover:text-danger"
              aria-label="Row hatao"
              onClick={() => removeRow(row.id)}
              disabled={rows.length <= 1}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Plus className="size-4" />}
          onClick={() => setRows((prev) => [...prev, newRow()])}
        >
          Aur ek line
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={readyCount === 0}
          onClick={() => void importCsv(rowsToCsv(rows), "List se")}
        >
          {readyCount > 0
            ? `${readyCount} products add karo`
            : "Pehle naam + daam bharo"}
        </Button>
      </div>

      <div className="relative flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          ya
        </span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          ref={fileRef}
          id={fileId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => void onFilePick(e.target.files?.[0])}
        />
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<FileUp className="size-4" />}
          loading={busy}
          onClick={() => fileRef.current?.click()}
        >
          Phone se file chuno
        </Button>
        <a
          href="/sample-products.csv"
          download
          className="text-sm text-forest-2 underline-offset-2 hover:underline"
        >
          Sample file download
        </a>
      </div>

      {msg ? (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            celebrate
              ? "bg-success-soft text-success"
              : "bg-paper-2 text-ink-muted"
          }`}
          role="status"
        >
          {msg}
        </p>
      ) : null}
    </Surface>
  );
}

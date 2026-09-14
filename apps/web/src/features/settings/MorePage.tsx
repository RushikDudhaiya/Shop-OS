import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  APP_NAME,
  BUSINESS_TYPES,
  PAYMENT_METHODS,
  ROLES,
  type PaymentMethod,
  type Role,
} from "@shop-os/shared";
import {
  Building2,
  Bot,
  Boxes,
  BarChart3,
  CreditCard,
  Database,
  FileText,
  GripVertical,
  Headphones,
  LogOut,
  Pencil,
  Percent,
  Plus,
  Settings2,
  ShieldAlert,
  Store,
  Trash2,
  Truck,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  AppPageHeader,
  Badge,
  Button,
  EmptyState,
  Input,
  PageLoader,
  Surface,
} from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { api, ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/cn";

type TabId =
  | "profile"
  | "billing"
  | "payments"
  | "users"
  | "preferences"
  | "backup";

type ShopSettings = {
  simpleMode?: boolean;
  allowNegativeStock?: boolean;
  defaultPaymentMethod?: PaymentMethod;
  gstEnabled?: boolean;
  invoicePrefix?: string;
  gstin?: string;
  address?: string;
  phone?: string;
  email?: string;
  billTerms?: string;
  askCustomerName?: boolean;
  taxType?: "GST" | "VAT" | "NONE";
  gstRate?: number;
  taxLabel?: string;
  enabledPaymentMethods?: PaymentMethod[];
  logoUrl?: string;
};

type ShopPayload = {
  _id: string;
  name: string;
  businessType?: string | null;
  settings?: ShopSettings;
};

type Member = {
  _id: string;
  userId: string;
  role: Role;
  phone: string | null;
  name: string | null;
};

const TABS: { id: TabId; label: string; icon: typeof Store }[] = [
  { id: "profile", label: "Business Profile", icon: Store },
  { id: "billing", label: "Billing & Taxes", icon: FileText },
  { id: "payments", label: "Payment Methods", icon: CreditCard },
  { id: "users", label: "Users", icon: Users },
  { id: "preferences", label: "Preferences", icon: Settings2 },
  { id: "backup", label: "Backup & Data", icon: Database },
];

const BUSINESS_LABELS: Record<string, string> = {
  kirana: "Grocery Store",
  stationery: "Stationery",
  cosmetics: "Cosmetics",
  hardware: "Hardware",
  electrical: "Electrical",
  bakery: "Bakery",
  gift: "Gift Shop",
  accessory: "Accessory",
  other: "Other",
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  CREDIT: "Credit / Udhaar",
  BANK_TRANSFER: "Bank Transfer",
};

const DEFAULT_METHODS: PaymentMethod[] = [
  "CASH",
  "UPI",
  "CARD",
  "BANK_TRANSFER",
];

const fieldClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink hover:border-ink-muted/40 focus:border-forest";
const areaClass =
  "min-h-[88px] w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink hover:border-ink-muted/40 focus:border-forest";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-forest" : "bg-line",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
          checked ? "left-5" : "left-0.5",
        )}
      />
    </button>
  );
}

export function MorePage() {
  const { user, activeShop, logout, refresh, setActiveShopId } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const shopId = activeShop?._id;
  const [loggingOut, setLoggingOut] = useState(false);

  const tabParam = searchParams.get("tab") as TabId | null;
  const activeTab: TabId =
    TABS.some((t) => t.id === tabParam) && tabParam ? tabParam : "profile";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [businessType, setBusinessType] = useState<string>("kirana");
  const [settings, setSettings] = useState<ShopSettings>({});

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("CASHIER");
  const [inviteSaving, setInviteSaving] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);

  const setTab = (id: TabId) => {
    setSearchParams(id === "profile" ? {} : { tab: id });
  };

  const loadShop = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ shop: ShopPayload }>(`/api/shops/${shopId}`);
      setShopName(data.shop.name);
      setBusinessType(data.shop.businessType ?? "kirana");
      setSettings(data.shop.settings ?? {});
      setOwnerName(user?.name ?? "");
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Settings load fail",
      );
    } finally {
      setLoading(false);
    }
  }, [shopId, user?.name]);

  const loadMembers = useCallback(async () => {
    if (!shopId) return;
    setMembersLoading(true);
    try {
      const data = await api<{ members: Member[] }>(
        `/api/shops/${shopId}/members`,
      );
      setMembers(data.members);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void loadShop();
  }, [loadShop]);

  useEffect(() => {
    if (activeTab === "users") void loadMembers();
  }, [activeTab, loadMembers]);

  const enabledMethods = useMemo(() => {
    const list = settings.enabledPaymentMethods?.length
      ? settings.enabledPaymentMethods
      : DEFAULT_METHODS;
    return list;
  }, [settings.enabledPaymentMethods]);

  async function saveAll() {
    if (!shopId) return;
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const email = settings.email?.trim() || undefined;
      await Promise.all([
        api(`/api/shops/${shopId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: shopName.trim(),
            businessType,
          }),
        }),
        api(`/api/shops/${shopId}/settings`, {
          method: "PATCH",
          body: JSON.stringify({
            ...settings,
            email,
            gstEnabled: Boolean(settings.gstEnabled),
            askCustomerName: settings.askCustomerName !== false,
            simpleMode: settings.simpleMode !== false,
            allowNegativeStock: Boolean(settings.allowNegativeStock),
            enabledPaymentMethods: enabledMethods,
          }),
        }),
        ownerName.trim()
          ? api("/api/auth/profile", {
              method: "PATCH",
              body: JSON.stringify({ name: ownerName.trim() }),
            })
          : Promise.resolve(),
      ]);
      setMsg("Settings saved");
      await refresh();
      if (shopId) setActiveShopId(shopId);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "Save fail",
      );
    } finally {
      setSaving(false);
    }
  }

  function onLogoPick(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Sirf image file (PNG/JPG)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo max 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      setSettings((s) => ({ ...s, logoUrl: url }));
    };
    reader.readAsDataURL(file);
  }

  function toggleMethod(method: PaymentMethod, on: boolean) {
    setSettings((s) => {
      const current = s.enabledPaymentMethods?.length
        ? [...s.enabledPaymentMethods]
        : [...DEFAULT_METHODS];
      const next = on
        ? current.includes(method)
          ? current
          : [...current, method]
        : current.filter((m) => m !== method);
      if (next.length === 0) return s;
      return { ...s, enabledPaymentMethods: next };
    });
  }

  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (!shopId) return;
    setInviteSaving(true);
    setError(null);
    try {
      await api(`/api/shops/${shopId}/members`, {
        method: "POST",
        body: JSON.stringify({
          phone: invitePhone,
          name: inviteName || undefined,
          role: inviteRole,
        }),
      });
      setInvitePhone("");
      setInviteName("");
      await loadMembers();
      setMsg("Staff added");
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "Add fail",
      );
    } finally {
      setInviteSaving(false);
    }
  }

  async function changeRole(membershipId: string, nextRole: Role) {
    if (!shopId) return;
    await api(`/api/shops/${shopId}/members/${membershipId}`, {
      method: "PATCH",
      body: JSON.stringify({ role: nextRole }),
    });
    await loadMembers();
  }

  async function backupNow() {
    if (!shopId) return;
    setMsg(null);
    try {
      const [shopRes, products, customers, expenses, sales] = await Promise.all([
        api<{ shop: ShopPayload }>(`/api/shops/${shopId}`),
        api<{ items: unknown[] }>(
          `/api/shops/${shopId}/products?pageSize=100`,
        ).catch(() => ({ items: [] })),
        api<{ customers: unknown[] }>(
          `/api/shops/${shopId}/customers?q=`,
        ).catch(() => ({ customers: [] })),
        api<{ items: unknown[] }>(`/api/shops/${shopId}/expenses`).catch(
          () => ({ items: [] }),
        ),
        api<{ items: unknown[] }>(
          `/api/shops/${shopId}/sales?pageSize=50`,
        ).catch(() => ({ items: [] })),
      ]);
      const payload = {
        exportedAt: new Date().toISOString(),
        shop: shopRes.shop,
        products: products.items,
        customers: customers.customers,
        expenses: expenses.items,
        sales: sales.items,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shop-os-backup-${shopName || "shop"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("Backup downloaded");
    } catch {
      setError("Backup fail");
    }
  }

  function resetLocalData() {
    const ok = window.confirm(
      "Local app data (budget, active shop prefs) clear hogi. Server pe sales/products delete nahi honge. Continue?",
    );
    if (!ok) return;
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith("shop_os_"),
    );
    for (const k of keys) localStorage.removeItem(k);
    setMsg("Local data cleared");
  }

  if (!shopId) return <PageLoader />;

  return (
    <div className="w-full space-y-5">
      <AppPageHeader
        title="Settings"
        subtitle="Apne shop aur account ki settings yahan manage karein."
      />

      <section className="grid grid-cols-2 gap-2 md:hidden">
        <MobileShortcut to="/autopilot" label="Shop Autopilot" icon={Bot} />
        <MobileShortcut to="/inventory" label="Inventory" icon={Boxes} />
        <MobileShortcut to="/purchases" label="Purchases" icon={Truck} />
        <MobileShortcut to="/reports" label="Reports" icon={BarChart3} />
        <MobileShortcut to="/profit" label="Profit Margin" icon={Percent} />
        <MobileShortcut to="/expenses" label="Kharcha" icon={Wallet} />
        <MobileShortcut to="/staff" label="Staff" icon={Users} />
      </section>

      <nav className="-mx-3 flex gap-1 overflow-x-auto border-b border-line px-3 pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-forest text-forest"
                  : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {msg ? (
        <p className="rounded-xl bg-success-soft px-3 py-2 text-sm font-medium text-success">
          {msg}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <PageLoader />
      ) : (
        <>
          {activeTab === "profile" ? (
            <section className="space-y-4">
              <Surface className="space-y-5">
                <div className="grid gap-5 lg:grid-cols-[1fr_200px]">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Shop Name"
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                    />
                    <label className="flex flex-col gap-1.5 sm:row-span-2">
                      <span className="text-sm font-medium text-ink">
                        Address
                      </span>
                      <textarea
                        className={areaClass}
                        value={settings.address ?? ""}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            address: e.target.value,
                          }))
                        }
                        rows={4}
                      />
                    </label>
                    <Input
                      label="Owner Name"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                    />
                    <Input
                      label="Email"
                      type="email"
                      value={settings.email ?? ""}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, email: e.target.value }))
                      }
                    />
                    <Input
                      label="Phone Number"
                      value={settings.phone ?? user?.phone ?? ""}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, phone: e.target.value }))
                      }
                    />
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-ink">
                        Business Type
                      </span>
                      <select
                        className={fieldClass}
                        value={businessType}
                        onChange={(e) => setBusinessType(e.target.value)}
                      >
                        {BUSINESS_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {BUSINESS_LABELS[t] ?? t}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-paper-2/40 p-4">
                    <div className="flex size-28 items-center justify-center overflow-hidden rounded-2xl border border-line bg-white">
                      {settings.logoUrl ? (
                        <img
                          src={settings.logoUrl}
                          alt="Shop logo"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Building2 className="size-10 text-ink-muted" />
                      )}
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) =>
                        onLogoPick(e.target.files?.[0] ?? null)
                      }
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Upload className="size-4" />}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      Change Logo
                    </Button>
                    <p className="text-center text-xs text-ink-muted">
                      PNG, JPG up to 2MB
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="gold"
                    loading={saving}
                    onClick={() => void saveAll()}
                  >
                    Save Changes
                  </Button>
                </div>
              </Surface>

              <div className="grid gap-4 lg:grid-cols-3">
                <Surface className="space-y-3">
                  <h2 className="font-semibold text-ink">Billing Settings</h2>
                  <Input
                    label="Default Bill Prefix"
                    value={settings.invoicePrefix ?? ""}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        invoicePrefix: e.target.value,
                      }))
                    }
                    placeholder="#"
                  />
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">
                      Default Payment Method
                    </span>
                    <select
                      className={fieldClass}
                      value={settings.defaultPaymentMethod ?? "CASH"}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          defaultPaymentMethod: e.target
                            .value as PaymentMethod,
                        }))
                      }
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">
                      Bill Terms & Notes
                    </span>
                    <textarea
                      className={areaClass}
                      value={settings.billTerms ?? ""}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          billTerms: e.target.value,
                        }))
                      }
                      placeholder="Thank you for shopping with us!"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-forest"
                      checked={settings.askCustomerName !== false}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          askCustomerName: e.target.checked,
                        }))
                      }
                    />
                    Ask for customer name on new bill
                  </label>
                </Surface>

                <Surface className="space-y-3">
                  <h2 className="font-semibold text-ink">Taxes</h2>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Enable Taxes</span>
                    <Toggle
                      checked={Boolean(settings.gstEnabled)}
                      onChange={(v) =>
                        setSettings((s) => ({ ...s, gstEnabled: v }))
                      }
                      label="Enable taxes"
                    />
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">Tax Type</span>
                    <select
                      className={fieldClass}
                      value={settings.taxType ?? "GST"}
                      disabled={!settings.gstEnabled}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          taxType: e.target.value as "GST" | "VAT" | "NONE",
                        }))
                      }
                    >
                      <option value="GST">GST</option>
                      <option value="VAT">VAT</option>
                      <option value="NONE">None</option>
                    </select>
                  </label>
                  <Input
                    label="GST Rate (%)"
                    type="number"
                    min="0"
                    max="100"
                    disabled={!settings.gstEnabled}
                    value={settings.gstRate ?? ""}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        gstRate: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      }))
                    }
                  />
                  <Input
                    label="Tax Label (on bill)"
                    disabled={!settings.gstEnabled}
                    value={settings.taxLabel ?? ""}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, taxLabel: e.target.value }))
                    }
                    placeholder="GST"
                  />
                  {settings.gstEnabled ? (
                    <Input
                      label="GSTIN"
                      value={settings.gstin ?? ""}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, gstin: e.target.value }))
                      }
                      placeholder="22AAAAA0000A1Z5"
                    />
                  ) : null}
                </Surface>

                <Surface className="space-y-3">
                  <h2 className="font-semibold text-ink">Payment Methods</h2>
                  <ul className="space-y-2">
                    {PAYMENT_METHODS.filter((m) => m !== "CREDIT").map((m) => (
                      <li
                        key={m}
                        className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-2"
                      >
                        <GripVertical className="size-4 text-ink-muted" />
                        <span className="flex-1 text-sm font-medium">
                          {PAYMENT_LABELS[m]}
                        </span>
                        <Toggle
                          checked={enabledMethods.includes(m)}
                          onChange={(on) => toggleMethod(m, on)}
                          label={`Toggle ${m}`}
                        />
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    leftIcon={<Plus className="size-4" />}
                    onClick={() => setTab("payments")}
                  >
                    Add Payment Method
                  </Button>
                </Surface>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Surface className="space-y-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-forest/10 text-forest">
                    <Users className="size-5" />
                  </div>
                  <h3 className="font-semibold">Users</h3>
                  <p className="text-sm text-ink-muted">
                    Manage staff users and permissions
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setTab("users")}
                  >
                    Manage Users
                  </Button>
                </Surface>

                <Surface className="space-y-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                    <Database className="size-5" />
                  </div>
                  <h3 className="font-semibold">Backup & Data</h3>
                  <p className="text-sm text-ink-muted">
                    Backup your data regularly to keep it safe
                  </p>
                  <Button variant="secondary" onClick={() => void backupNow()}>
                    Backup Now
                  </Button>
                </Surface>

                <Surface className="space-y-3 border-danger/30">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-danger-soft text-danger">
                    <ShieldAlert className="size-5" />
                  </div>
                  <h3 className="font-semibold text-danger">Danger Zone</h3>
                  <p className="text-sm text-ink-muted">
                    All local prefs will be cleared. Server data stays.
                  </p>
                  <Button variant="danger" onClick={resetLocalData}>
                    Reset All Data
                  </Button>
                </Surface>
              </div>
            </section>
          ) : null}

          {activeTab === "billing" ? (
            <section className="grid gap-4 lg:grid-cols-2">
              <Surface className="space-y-3">
                <h2 className="font-semibold">Billing Settings</h2>
                <Input
                  label="Default Bill Prefix"
                  value={settings.invoicePrefix ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      invoicePrefix: e.target.value,
                    }))
                  }
                />
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">
                    Default Payment Method
                  </span>
                  <select
                    className={fieldClass}
                    value={settings.defaultPaymentMethod ?? "CASH"}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        defaultPaymentMethod: e.target.value as PaymentMethod,
                      }))
                    }
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Bill Terms & Notes</span>
                  <textarea
                    className={areaClass}
                    value={settings.billTerms ?? ""}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, billTerms: e.target.value }))
                    }
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-forest"
                    checked={settings.askCustomerName !== false}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        askCustomerName: e.target.checked,
                      }))
                    }
                  />
                  Ask for customer name on new bill
                </label>
              </Surface>
              <Surface className="space-y-3">
                <h2 className="font-semibold">Taxes</h2>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Enable Taxes</span>
                  <Toggle
                    checked={Boolean(settings.gstEnabled)}
                    onChange={(v) =>
                      setSettings((s) => ({ ...s, gstEnabled: v }))
                    }
                  />
                </div>
                <Input
                  label="GSTIN"
                  value={settings.gstin ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, gstin: e.target.value }))
                  }
                />
                <Input
                  label="GST Rate (%)"
                  type="number"
                  value={settings.gstRate ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      gstRate: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    }))
                  }
                />
                <Input
                  label="Tax Label"
                  value={settings.taxLabel ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, taxLabel: e.target.value }))
                  }
                />
              </Surface>
              <div className="lg:col-span-2 flex justify-end">
                <Button
                  variant="gold"
                  loading={saving}
                  onClick={() => void saveAll()}
                >
                  Save Changes
                </Button>
              </div>
            </section>
          ) : null}

          {activeTab === "payments" ? (
            <section className="space-y-4">
              <Surface className="space-y-3">
                <h2 className="font-semibold">Payment Methods</h2>
                <ul className="divide-y divide-line/70">
                  {PAYMENT_METHODS.map((m) => {
                    const on = enabledMethods.includes(m);
                    return (
                      <li
                        key={m}
                        className="flex flex-wrap items-center gap-3 py-3"
                      >
                        <GripVertical className="size-4 text-ink-muted" />
                        <span className="min-w-[120px] flex-1 font-medium">
                          {PAYMENT_LABELS[m]}
                        </span>
                        <Toggle
                          checked={on}
                          onChange={(v) => toggleMethod(m, v)}
                        />
                        <span className="inline-flex gap-1 text-ink-muted">
                          <Pencil className="size-4 opacity-40" />
                          <Trash2
                            className={cn(
                              "size-4 cursor-pointer",
                              m === "CASH"
                                ? "opacity-30"
                                : "hover:text-danger",
                            )}
                            onClick={() => {
                              if (m !== "CASH") toggleMethod(m, false);
                            }}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  variant="gold"
                  loading={saving}
                  onClick={() => void saveAll()}
                >
                  Save Changes
                </Button>
              </Surface>
            </section>
          ) : null}

          {activeTab === "users" ? (
            <section className="space-y-4">
              <Surface>
                <form className="space-y-3" onSubmit={addMember}>
                  <h2 className="font-semibold">Add staff</h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input
                      label="Phone"
                      value={invitePhone}
                      onChange={(e) =>
                        setInvitePhone(
                          e.target.value.replace(/\D/g, "").slice(0, 10),
                        )
                      }
                      required
                    />
                    <Input
                      label="Name (optional)"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                    />
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">Role</span>
                      <select
                        className={fieldClass}
                        value={inviteRole}
                        onChange={(e) =>
                          setInviteRole(e.target.value as Role)
                        }
                      >
                        {ROLES.filter((r: Role) => r !== "OWNER").map(
                          (r: Role) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <Button type="submit" variant="gold" loading={inviteSaving}>
                    Invite / Add
                  </Button>
                </form>
              </Surface>

              {membersLoading ? (
                <PageLoader />
              ) : members.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-7" />}
                  title="No staff yet"
                />
              ) : (
                <ul className="space-y-2">
                  {members.map((m) => (
                    <li key={m._id}>
                      <Surface className="flex flex-wrap items-center justify-between gap-3 !py-3">
                        <div>
                          <p className="font-medium">
                            {m.name ?? m.phone ?? "User"}
                          </p>
                          <p className="text-sm text-ink-muted">{m.phone}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone="forest">{m.role}</Badge>
                          {m.role !== "OWNER" ? (
                            <select
                              className="h-10 rounded-xl border border-line px-2 text-sm"
                              value={m.role}
                              onChange={(e) =>
                                void changeRole(
                                  m._id,
                                  e.target.value as Role,
                                )
                              }
                            >
                              {ROLES.filter((r: Role) => r !== "OWNER").map(
                                (r: Role) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </Surface>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/staff" className="text-sm font-medium text-forest">
                Open full Staff page →
              </Link>
            </section>
          ) : null}

          {activeTab === "preferences" ? (
            <section className="space-y-4">
              <Surface className="space-y-4">
                <h2 className="font-semibold">Preferences</h2>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Simple mode</p>
                    <p className="text-xs text-ink-muted">
                      Billing ko simple rakho
                    </p>
                  </div>
                  <Toggle
                    checked={settings.simpleMode !== false}
                    onChange={(v) =>
                      setSettings((s) => ({ ...s, simpleMode: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Allow negative stock</p>
                    <p className="text-xs text-ink-muted">
                      Stock 0 ke neeche ja sake
                    </p>
                  </div>
                  <Toggle
                    checked={Boolean(settings.allowNegativeStock)}
                    onChange={(v) =>
                      setSettings((s) => ({ ...s, allowNegativeStock: v }))
                    }
                  />
                </div>
                <Button
                  variant="gold"
                  loading={saving}
                  onClick={() => void saveAll()}
                >
                  Save Changes
                </Button>
              </Surface>
            </section>
          ) : null}

          {activeTab === "backup" ? (
            <section className="grid gap-4 sm:grid-cols-2">
              <Surface className="space-y-3">
                <h2 className="font-semibold">Backup & Data</h2>
                <p className="text-sm text-ink-muted">
                  Shop, products, customers, expenses, recent sales — JSON
                  download.
                </p>
                <Button variant="primary" onClick={() => void backupNow()}>
                  Backup Now
                </Button>
              </Surface>
              <Surface className="space-y-3 border-danger/30">
                <h2 className="font-semibold text-danger">Danger Zone</h2>
                <p className="text-sm text-ink-muted">
                  Local prefs clear. Server data permanent delete nahi hota
                  yahan se.
                </p>
                <Button variant="danger" onClick={resetLocalData}>
                  Reset All Data
                </Button>
              </Surface>
            </section>
          ) : null}
        </>
      )}

      <Surface className="mt-2 space-y-3">
        <h2 className="font-semibold">Account</h2>
        <p className="text-sm text-ink-muted">
          Logged in: {user?.phone ?? "—"}
        </p>
        <Button
          variant="danger"
          leftIcon={<LogOut className="size-4" />}
          loading={loggingOut}
          onClick={() => {
            void (async () => {
              setLoggingOut(true);
              setError(null);
              try {
                await logout();
              } catch {
                // Cookie/session clear client-side already; still go to login.
              } finally {
                navigate("/login", { replace: true });
                setLoggingOut(false);
              }
            })();
          }}
        >
          Logout
        </Button>
      </Surface>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm text-ink-muted">
        <p>
          © {APP_NAME} v{import.meta.env.VITE_APP_VERSION ?? "1.0.0"}
        </p>
        <a
          href="mailto:support@shopos.app"
          className="inline-flex items-center gap-2 hover:text-forest"
        >
          <Headphones className="size-4" />
          Need help? Contact support
        </a>
      </footer>
    </div>
  );
}

function MobileShortcut({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-3 text-sm font-semibold text-ink shadow-soft"
    >
      <span className="inline-flex size-9 items-center justify-center rounded-xl bg-forest/10 text-forest">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

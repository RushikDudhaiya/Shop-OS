import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ROLES, type Role } from "@shop-os/shared";
import { Trash2, Users } from "lucide-react";
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

type Member = {
  _id: string;
  userId: string;
  role: Role;
  phone: string | null;
  name: string | null;
};

export function StaffPage() {
  const { activeShop, user } = useAuth();
  const shopId = activeShop?._id;
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("CASHIER");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ members: Member[] }>(
        `/api/shops/${shopId}/members`,
      );
      setMembers(data.members);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Staff list nahi mila",
      );
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (!shopId) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/shops/${shopId}/members`, {
        method: "POST",
        body: JSON.stringify({ phone, name: name || undefined, role }),
      });
      setPhone("");
      setName("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "Add fail",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(membershipId: string, nextRole: Role) {
    if (!shopId) return;
    setError(null);
    try {
      await api(`/api/shops/${shopId}/members/${membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "Role update fail",
      );
    }
  }

  async function removeMember(member: Member) {
    if (!shopId) return;
    if (member.role === "OWNER") return;
    const label = member.name || member.phone || "staff";
    if (!window.confirm(`${label} ko staff se hataana hai?`)) return;
    setDeletingId(member._id);
    setError(null);
    try {
      await api(`/api/shops/${shopId}/members/${member._id}`, {
        method: "DELETE",
      });
      setMembers((prev) => prev.filter((m) => m._id !== member._id));
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "Delete fail",
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (!shopId) return <PageLoader />;

  return (
    <div className="w-full space-y-4">
      <AppPageHeader
        title="Staff"
        subtitle="Cashier ko cost/profit nahi dikhta. Roles audited."
      />

      <Surface>
        <form className="space-y-3" onSubmit={addMember}>
          <h3 className="font-semibold">Add staff</h3>
          <Input
            label="Phone"
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
            }
            required
          />
          <Input
            label="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Role</span>
            <select
              className="h-12 rounded-xl border border-line px-3"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.filter((r: Role) => r !== "OWNER").map((r: Role) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" variant="gold" loading={saving}>
            Invite / Add
          </Button>
        </form>
      </Surface>

      {loading ? (
        <PageLoader />
      ) : members.length === 0 ? (
        <EmptyState icon={<Users className="size-7" />} title="No staff yet" />
      ) : (
        <ul className="space-y-2">
          {members.map((m) => {
            const canDelete =
              m.role !== "OWNER" && (!user?._id || m.userId !== user._id);
            return (
              <li key={m._id}>
                <Surface className="flex flex-wrap items-center justify-between gap-3 !py-3">
                  <div>
                    <p className="font-medium">{m.name ?? m.phone ?? "User"}</p>
                    <p className="text-sm text-ink-muted">{m.phone}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="forest">{m.role}</Badge>
                    {m.role !== "OWNER" ? (
                      <select
                        className="h-10 rounded-xl border border-line px-2 text-sm"
                        value={m.role}
                        onChange={(e) =>
                          void changeRole(m._id, e.target.value as Role)
                        }
                        aria-label="Change role"
                      >
                        {ROLES.filter((r: Role) => r !== "OWNER").map(
                          (r: Role) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ),
                        )}
                      </select>
                    ) : null}
                    {canDelete ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="!border-danger/30 !text-danger hover:!bg-danger-soft"
                        leftIcon={<Trash2 className="size-3.5" />}
                        loading={deletingId === m._id}
                        onClick={() => void removeMember(m)}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </Surface>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

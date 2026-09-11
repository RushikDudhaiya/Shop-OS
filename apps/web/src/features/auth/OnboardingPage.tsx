import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BUSINESS_TYPES } from "@shop-os/shared";
import { Button, Input, PageHeader, Surface } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "./AuthContext";

const labels: Record<(typeof BUSINESS_TYPES)[number], string> = {
  kirana: "Kirana / General",
  stationery: "Stationery",
  cosmetics: "Cosmetics",
  hardware: "Hardware",
  electrical: "Electrical",
  bakery: "Bakery",
  gift: "Gift",
  accessory: "Accessory",
  other: "Other",
};

export function OnboardingPage() {
  const navigate = useNavigate();
  const { refresh, setActiveShopId } = useAuth();
  const [name, setName] = useState("");
  const [businessType, setBusinessType] =
    useState<(typeof BUSINESS_TYPES)[number]>("kirana");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ shop: { _id: string } }>("/api/shops", {
        method: "POST",
        body: JSON.stringify({ name, businessType }),
      });
      setActiveShopId(res.shop._id);
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Shop create nahi hua",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <PageHeader
        title="Apni dukaan banao"
        subtitle="Naam daalo — pehle sale ke liye 100 products ki zarurat nahi."
      />
      <Surface>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            label="Shop name"
            placeholder="Ravi Kirana Store"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
          <label className="flex w-full flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Business type</span>
            <select
              className="h-12 w-full rounded-xl border border-line bg-white px-3.5 text-base"
              value={businessType}
              onChange={(e) =>
                setBusinessType(e.target.value as (typeof BUSINESS_TYPES)[number])
              }
            >
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {labels[t]}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" variant="gold" size="lg" fullWidth loading={loading}>
            Shop banao & start
          </Button>
        </form>
      </Surface>
    </div>
  );
}

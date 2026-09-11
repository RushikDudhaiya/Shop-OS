import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { APP_NAME, APP_TAGLINE } from "@shop-os/shared";
import { Button, Input, Surface } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth, type AuthShop, type AuthUser } from "./AuthContext";

type StartRes = {
  ok: true;
  phone: string;
  expiresInSec: number;
  devOtp?: string;
};

type VerifyRes = {
  user: AuthUser;
  shops: AuthShop[];
};

export function LoginPage() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onStart(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<StartRes>("/api/auth/start", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setDevOtp(res.devOtp ?? null);
      if (res.devOtp) setOtp(res.devOtp);
      setStep("otp");
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "OTP bhej nahi paye",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<VerifyRes>("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ phone, otp }),
      });
      applySession(res);
      navigate(res.shops.length ? "/" : "/onboarding", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "OTP galat hai",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-8 text-center">
        <p className="font-display text-4xl font-bold text-forest">{APP_NAME}</p>
        <p className="mt-2 text-sm text-ink-muted">{APP_TAGLINE}</p>
      </div>

      <Surface className="space-y-4">
        <h1 className="text-xl font-semibold text-ink">
          {step === "phone" ? "Login" : "OTP enter karo"}
        </h1>

        {step === "phone" ? (
          <form className="space-y-4" onSubmit={onStart}>
            <Input
              label="Mobile number"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              hint="10-digit Indian mobile"
              required
            />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
              OTP bhejo
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={onVerify}>
            <p className="text-sm text-ink-muted">
              OTP bheja: <span className="font-medium text-ink">{phone}</span>
            </p>
            <Input
              label="OTP"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 digits"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
            {devOtp ? (
              <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
                Dev OTP: <strong>{devOtp}</strong>
              </p>
            ) : null}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" variant="gold" size="lg" fullWidth loading={loading}>
              Verify & continue
            </Button>
            <Button
              type="button"
              variant="ghost"
              fullWidth
              onClick={() => {
                setStep("phone");
                setOtp("");
                setDevOtp(null);
                setError(null);
              }}
            >
              Number badlo
            </Button>
          </form>
        )}
      </Surface>
    </div>
  );
}

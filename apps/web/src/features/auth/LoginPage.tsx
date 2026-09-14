import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  IndianRupee,
  Lock,
  Phone,
  Store,
  Users,
} from "lucide-react";
import { APP_NAME } from "@shop-os/shared";
import { api, ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth, type AuthShop, type AuthUser } from "./AuthContext";

type StartRes = {
  ok: true;
  phone: string;
  expiresInSec: number;
  challengeId: string;
  devOtp?: string;
};

type VerifyRes = {
  user: AuthUser;
  shops: AuthShop[];
};

/** Image-2 design tokens */
const FOREST = "#0F3D2E";
const FOREST_HOVER = "#0a2e22";
const LEAF = "#2F8F6B";
const MINT = "#E6F4EE";
const BG = "#F4FAF7";
const MUTED = "#6B7A72";

const NAV_LINKS = [
  "Smart Billing",
  "Easy Inventory",
  "Better Business",
] as const;

const FEATURES = [
  {
    icon: IndianRupee,
    title: "Easy Billing",
    subtitle: "Fast & Simple",
  },
  {
    icon: Boxes,
    title: "Inventory",
    subtitle: "Always In Stock",
  },
  {
    icon: Users,
    title: "Customers",
    subtitle: "Better Relations",
  },
  {
    icon: BarChart3,
    title: "Reports",
    subtitle: "Know Your Growth",
  },
] as const;

function LeafBg() {
  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -left-10 h-[280px] w-[280px] text-[#9fd0b8] opacity-70 sm:h-[360px] sm:w-[360px]"
        viewBox="0 0 360 360"
        fill="currentColor"
      >
        <path d="M20 300C60 160 160 60 320 20c-20 120-90 210-220 260-20-4-40-10-60-16Z" />
        <path
          d="M70 270c50-70 120-120 200-160"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          opacity="0.5"
        />
      </svg>
      <svg
        aria-hidden
        className="pointer-events-none absolute -bottom-6 -right-8 h-[260px] w-[260px] text-[#9fd0b8] opacity-65 sm:h-[340px] sm:w-[340px]"
        viewBox="0 0 360 360"
        fill="currentColor"
      >
        <path d="M340 60C300 200 200 300 40 340c20-120 90-210 220-260 20 4 40 10 60 16Z" />
      </svg>
    </>
  );
}

function BrandLogo({
  align = "left",
}: {
  align?: "left" | "center";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        align === "center" && "justify-center",
      )}
    >
      <span
        className="inline-flex size-11 items-center justify-center rounded-[14px] text-white shadow-soft"
        style={{ background: FOREST }}
      >
        <Store className="size-5" strokeWidth={2.25} />
      </span>
      <div>
        <p
          className="text-[1.35rem] font-bold leading-none tracking-tight sm:text-[1.5rem]"
          style={{ color: FOREST }}
        >
          {APP_NAME}
        </p>
        <p className="mt-1 text-xs font-medium" style={{ color: MUTED }}>
          Smart Shop Management
        </p>
      </div>
    </div>
  );
}

function LoginIllustration({
  mode,
}: {
  mode: "desktop" | "mobile";
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[24px]",
        mode === "desktop"
          ? "aspect-[700/500] w-full max-w-[700px]"
          : "aspect-[320/250] w-full",
      )}
      style={{ background: MINT }}
    >
      <img
        src="/login-illustration.png"
        alt=""
        className="h-full w-full object-contain object-center"
        width={mode === "desktop" ? 700 : 320}
        height={mode === "desktop" ? 500 : 250}
        draggable={false}
      />
    </div>
  );
}

function FeatureTile({
  icon: Icon,
  title,
  subtitle,
  mode,
}: {
  icon: typeof IndianRupee;
  title: string;
  subtitle: string;
  mode: "desktop" | "mobile";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-[#d7ebe1] text-center shadow-[0_6px_18px_rgb(15_61_46/0.05)]",
        mode === "desktop"
          ? "h-[120px] w-[140px] shrink-0 px-2"
          : "min-w-0 flex-1 px-1 py-2.5",
      )}
      style={{ background: MINT }}
    >
      <span
        className={cn(
          "mb-1 inline-flex items-center justify-center rounded-full bg-white/70",
          mode === "desktop" ? "mb-1.5 size-11" : "size-7",
        )}
        style={{ color: FOREST }}
      >
        <Icon
          className={mode === "desktop" ? "size-5" : "size-3.5"}
          strokeWidth={2.1}
        />
      </span>
      <p
        className={cn(
          "font-semibold leading-tight",
          mode === "desktop" ? "text-sm" : "text-[10px]",
        )}
        style={{ color: FOREST }}
      >
        {title}
      </p>
      <p
        className={cn(
          "mt-0.5 leading-tight",
          mode === "desktop" ? "text-xs" : "text-[8px]",
        )}
        style={{ color: LEAF }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function LoginCardShell({ children }: { children: ReactNode }) {
  return (
    <div className="w-full rounded-[24px] bg-white p-6 shadow-[0_20px_50px_rgb(15_61_46/0.12)] sm:p-8">
      {children}
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onStart(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await api<StartRes>("/api/auth/start", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setChallengeId(res.challengeId);
      setDevOtp(res.devOtp ?? null);
      setOtp(res.devOtp ?? "");
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
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api<VerifyRes>("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({
          phone,
          otp: otp.trim(),
          challengeId: challengeId ?? undefined,
        }),
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

  const loginBody =
    step === "phone" ? (
      <form className="space-y-4" onSubmit={(e) => void onStart(e)}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium" style={{ color: MUTED }}>
            Mobile number
          </span>
          <div className="flex h-12 items-center gap-2.5 rounded-xl border border-[#D1D5DB] bg-white px-3 focus-within:border-[#2F8F6B] focus-within:ring-2 focus-within:ring-[#2F8F6B]/20">
            <Phone className="size-4 shrink-0 text-[#9aa39d]" />
            <input
              className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-[#b0b8b3]"
              style={{ color: FOREST }}
              inputMode="numeric"
              autoComplete="tel"
              placeholder="9876543210"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              required
              aria-label="Mobile number"
            />
          </div>
          <span className="mt-1.5 block text-[11px] font-medium" style={{ color: LEAF }}>
            10-digit Indian mobile number
          </span>
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {info ? (
          <p className="text-sm" style={{ color: FOREST }}>
            {info}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading || phone.length !== 10}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-55"
          style={{ background: FOREST }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = FOREST_HOVER;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = FOREST;
          }}
        >
          {loading ? "Bhej rahe hain…" : "OTP bhejo"}
          {!loading ? <ArrowRight className="size-4" strokeWidth={2.5} /> : null}
        </button>

        <div className="relative py-1 text-center">
          <span className="absolute inset-x-0 top-1/2 h-px bg-[#e2e8e4]" />
          <span
            className="relative bg-white px-3 text-sm"
            style={{ color: MUTED }}
          >
            Ya
          </span>
        </div>

        <button
          type="button"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 bg-white text-[15px] font-semibold transition-colors hover:bg-[#f4faf7]"
          style={{ color: FOREST, borderColor: LEAF }}
          onClick={() => {
            setError(null);
            setInfo(
              "Password login jaldi aa raha hai — abhi OTP se login karo.",
            );
          }}
        >
          <Lock className="size-4" style={{ color: FOREST }} />
          Password se login
        </button>

        <p className="pt-1 text-center text-[11px] text-[#9aa39d]">
          <button
            type="button"
            className="hover:underline"
            onClick={() => setInfo("Terms & Conditions page jaldi add hogi.")}
          >
            Terms & Conditions
          </button>
          <span className="mx-1.5">|</span>
          <button
            type="button"
            className="hover:underline"
            onClick={() => setInfo("Privacy Policy page jaldi add hogi.")}
          >
            Privacy Policy
          </button>
        </p>
      </form>
    ) : (
      <form className="space-y-4" onSubmit={(e) => void onVerify(e)}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium" style={{ color: MUTED }}>
            OTP
          </span>
          <input
            className="h-12 w-full rounded-xl border border-[#D1D5DB] px-3 text-center text-lg font-semibold tracking-[0.35em] outline-none focus:border-[#2F8F6B] focus:ring-2 focus:ring-[#2F8F6B]/20"
            style={{ color: FOREST }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            value={otp}
            onChange={(e) =>
              setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            required
            autoFocus
          />
        </label>

        {devOtp ? (
          <p className="rounded-xl bg-success-soft px-3 py-2.5 text-sm text-success">
            Login OTP: <strong className="tracking-widest">{devOtp}</strong>
            <span className="mt-1 block text-xs" style={{ color: MUTED }}>
              Abhi SMS nahi jaata — yahi OTP use karo.
            </span>
          </p>
        ) : (
          <p className="text-xs" style={{ color: MUTED }}>
            SMS aane ka wait karo. Nahi aaya to number badal ke dubara try karo.
          </p>
        )}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <button
          type="submit"
          disabled={loading || otp.length < 4}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-55"
          style={{ background: FOREST }}
        >
          {loading ? "Verify ho raha…" : "Verify & continue"}
          {!loading ? <ArrowRight className="size-4" /> : null}
        </button>

        <button
          type="button"
          className="inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold hover:bg-[#f4faf7]"
          style={{ color: MUTED }}
          onClick={() => {
            setStep("phone");
            setOtp("");
            setDevOtp(null);
            setChallengeId(null);
            setError(null);
            setInfo(null);
          }}
        >
          Number badlo
        </button>
      </form>
    );

  const loginHeader = (
    <div className="mb-6 text-center">
      <span
        className="mx-auto mb-3 inline-flex size-11 items-center justify-center rounded-[14px] text-white"
        style={{ background: FOREST }}
      >
        <Store className="size-5" strokeWidth={2.25} />
      </span>
      <h2
        className="text-[1.75rem] font-bold leading-none"
        style={{ color: FOREST }}
      >
        {step === "phone" ? "Login" : "OTP verify"}
      </h2>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        {step === "phone"
          ? "Apne account me wapas aaiye"
          : `${phone} pe OTP bheja`}
      </p>
    </div>
  );

  const heroCopy = (
    <div className="min-w-0">
      <h1
        className="text-[1.45rem] font-bold leading-[1.15] tracking-tight sm:text-[2rem] lg:text-[2.75rem]"
        style={{ color: FOREST }}
      >
        Apke Shop ka Smart Manager
      </h1>
      <p
        className="mt-2 max-w-lg text-[13px] leading-relaxed sm:mt-3 sm:text-[15px] lg:text-base"
        style={{ color: MUTED }}
      >
        Sales, Inventory, Customers, Reports aur bahut kuch – sab kuch ek hi
        jagah.
      </p>
      <p
        className="font-script mt-3 text-[1.45rem] leading-none sm:mt-4 sm:text-[1.9rem] lg:text-[2.2rem]"
        style={{ color: LEAF }}
      >
        Badhte raho...
      </p>
    </div>
  );

  return (
    <div className="relative min-h-dvh overflow-x-hidden" style={{ background: BG }}>
      <LeafBg />

      {/* Mobile — left-aligned hero + no horizontal scroll on footer cards */}
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-hidden px-4 pb-10 pt-5 lg:hidden">
        <header className="mb-4">
          <BrandLogo align="left" />
        </header>

        <section className="mb-4 grid grid-cols-[1.15fr_0.85fr] items-end gap-2">
          <div className="min-w-0 text-left">{heroCopy}</div>
          <div className="min-w-0">
            <LoginIllustration mode="mobile" />
          </div>
        </section>

        <LoginCardShell>
          {loginHeader}
          {loginBody}
        </LoginCardShell>

        <section className="mt-6 flex w-full gap-1.5">
          {FEATURES.map((f) => (
            <FeatureTile key={f.title} mode="mobile" {...f} />
          ))}
        </section>
      </div>

      {/* Desktop — image-2 positions: text left · placeholder center · login right · features footer */}
      <div className="relative mx-auto hidden min-h-dvh w-full max-w-[1280px] flex-col px-8 py-7 lg:flex xl:px-10">
        <header className="mb-8 flex items-center justify-between gap-6">
          <BrandLogo />
          <nav
            className="flex items-center gap-2 text-sm font-medium"
            style={{ color: MUTED }}
          >
            {NAV_LINKS.map((label, i) => (
              <span key={label} className="flex items-center gap-2">
                {i > 0 ? <span aria-hidden>·</span> : null}
                <span>{label}</span>
              </span>
            ))}
          </nav>
        </header>

        <div className="grid flex-1 grid-cols-[0.95fr_1.05fr_0.9fr] items-start gap-8 xl:gap-10">
          {/* Left — copy only */}
          <section className="min-w-0 pt-2">{heroCopy}</section>

          {/* Center — same placeholder design, only position */}
          <section className="flex min-w-0 justify-center pt-4">
            <LoginIllustration mode="desktop" />
          </section>

          {/* Right — login */}
          <section className="row-span-2 flex justify-end pt-2">
            <div className="w-full max-w-[400px]">
              <LoginCardShell>
                {loginHeader}
                {loginBody}
              </LoginCardShell>
            </div>
          </section>

          {/* Footer features — under left text + placeholder (image 2) */}
          <section className="col-span-2 mt-4 flex max-w-[720px] justify-between gap-3 pb-4">
            {FEATURES.map((f) => (
              <FeatureTile key={f.title} mode="desktop" {...f} />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

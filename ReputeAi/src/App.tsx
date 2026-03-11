import { useState, useEffect, useCallback, useRef } from "react";
import { initializePaddle, Paddle } from "@paddle/paddle-js";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

// ─── Config ────────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "569970007824-vtll6ndvbkeiilpt7c4700bqmehufn1g.apps.googleusercontent.com";
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY || "";
const PADDLE_TOKEN = import.meta.env.VITE_PADDLE_TOKEN || "test_5e1e7dd49d00da5dae32f3e82a5";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Review {
  id: number;
  author: string;
  rating: number;
  text: string;
  source: string;
  date: string;
  sentiment: "positive" | "negative" | "neutral";
  replied: boolean;
  reviewId?: string;
  avatar?: string;
}
interface GoogleUser {
  name: string;
  email: string;
  picture: string;
  accessToken: string;
}
interface Notif {
  msg: string;
  color: string;
  icon: string;
}

// ─── Demo Data ─────────────────────────────────────────────────────────────────
const DEMO_REVIEWS: Review[] = [
  { id: 1, author: "דני כהן", rating: 5, text: "שירות מעולה! הגעתי אחרי המלצה ולא התאכזבתי. הצוות מקצועי ואדיב מאוד.", source: "Google", date: "לפני יומיים", sentiment: "positive", replied: false, avatar: "ד" },
  { id: 2, author: "מיכל לוי", rating: 2, text: "המתנה ארוכה מדי, לא קיבלתי עדכון על העיכוב. מאכזב מאוד.", source: "Google", date: "לפני 3 ימים", sentiment: "negative", replied: false, avatar: "מ" },
  { id: 3, author: "יוסי אברהם", rating: 4, text: "בסך הכל טוב. האוכל טעים אבל השירות היה קצת איטי.", source: "Facebook", date: "לפני שבוע", sentiment: "neutral", replied: true, avatar: "י" },
  { id: 4, author: "רונית שפירא", rating: 5, text: "אחלה מקום! כבר הפכתי ללקוחה קבועה. ממליצה בחום לכולם!", source: "Google", date: "לפני שבוע", sentiment: "positive", replied: true, avatar: "ר" },
  { id: 5, author: "אמיר בן דוד", rating: 1, text: "חוויה גרועה מאוד. הזמנתי דרך האתר ולא קיבלתי אישור. לא אחזור.", source: "Google", date: "לפני 10 ימים", sentiment: "negative", replied: false, avatar: "א" },
  { id: 6, author: "נועה גולן", rating: 5, text: "הפתעה נעימה! האווירה מדהימה והמחירים הוגנים.", source: "Facebook", date: "לפני 2 שבועות", sentiment: "positive", replied: false, avatar: "נ" },
];

const AI_FALLBACKS: Record<string, string> = {
  positive: "תודה רבה על הביקורת החמה שלך! אנו שמחים שנהנית מהביקור ומצפים לראותך שוב בקרוב 😊",
  negative: "אנו מצטערים מאוד על החוויה הפחות טובה. אשמח ליצור איתך קשר אישי לפתרון מיידי של הנושא.",
  neutral: "תודה על הביקורת! נשמח לשמוע כיצד נוכל לשפר את חוויתך בביקור הבא.",
};

const WEEKLY_DATA = [
  { day: "ראשון", ביקורות: 2, חיוביות: 2, שליליות: 0 },
  { day: "שני", ביקורות: 1, חיוביות: 0, שליליות: 1 },
  { day: "שלישי", ביקורות: 3, חיוביות: 2, שליליות: 1 },
  { day: "רביעי", ביקורות: 0, חיוביות: 0, שליליות: 0 },
  { day: "חמישי", ביקורות: 4, חיוביות: 3, שליליות: 1 },
  { day: "שישי", ביקורות: 2, חיוביות: 2, שליליות: 0 },
  { day: "שבת", ביקורות: 1, חיוביות: 1, שליליות: 0 },
];

const PIE_DATA = [
  { name: "חיוביות", value: 3, color: "#22d3a0" },
  { name: "שליליות", value: 2, color: "#f87171" },
  { name: "ניטרליות", value: 1, color: "#5a5a7a" },
];

const detectSentiment = (r: number): "positive" | "negative" | "neutral" =>
  r >= 4 ? "positive" : r <= 2 ? "negative" : "neutral";

const fmtDate = (d: string) => {
  try {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (diff === 0) return "היום";
    if (diff === 1) return "אתמול";
    if (diff < 7) return `לפני ${diff} ימים`;
    if (diff < 30) return `לפני ${Math.floor(diff / 7)} שבועות`;
    return `לפני ${Math.floor(diff / 30)} חודשים`;
  } catch { return d; }
};

// ─── Sub Components ────────────────────────────────────────────────────────────
const Stars = ({ n, size = 13 }: { n: number; size?: number }) => (
  <span style={{ fontSize: size, letterSpacing: 1 }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <span key={i} style={{ color: i <= n ? "#fbbf24" : "#2a2a3e" }}>★</span>
    ))}
  </span>
);

const SentimentBadge = ({ s }: { s: string }) => {
  const map: Record<string, [string, string, string]> = {
    positive: ["חיובית", "#22d3a0", "rgba(34,211,160,0.12)"],
    negative: ["שלילית", "#f87171", "rgba(248,113,113,0.12)"],
    neutral: ["ניטרלית", "#8888aa", "rgba(136,136,170,0.12)"],
  };
  const [label, color, bg] = map[s] || map.neutral;
  return (
    <span style={{ background: bg, color, border: `1px solid ${color}30`, borderRadius: 100, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
      {label}
    </span>
  );
};

const Avatar = ({ letter, size = 36 }: { letter: string; size?: number }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg, #7c6ef5, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
    {letter}
  </div>
);

const Spinner = () => (
  <div style={{ width: 20, height: 20, border: "2px solid rgba(124,110,245,0.3)", borderTopColor: "#7c6ef5", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
);

const GoogleBtn = ({ onClick, text = "התחבר עם Google" }: { onClick: () => void; text?: string }) => (
  <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", background: "#fff", color: "#111", border: "none", borderRadius: "var(--radius-sm)", padding: "11px 20px", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "var(--font-body)", width: "100%", transition: "all 0.2s", boxShadow: "0 2px 12px rgba(0,0,0,0.3)" }}
    onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
    onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}>
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
    {text}
  </button>
);

const Notification = ({ notif }: { notif: Notif | null }) => {
  if (!notif) return null;
  return (
    <div style={{ position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", background: notif.color, color: "#fff", borderRadius: 12, padding: "12px 24px", fontWeight: 700, zIndex: 9999, fontSize: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.5)", display: "flex", gap: 8, alignItems: "center", animation: "slideIn 0.3s ease", maxWidth: "calc(100vw - 40px)", whiteSpace: "nowrap" }}>
      <span>{notif.icon}</span> {notif.msg}
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: "var(--radius-sm)", padding: "12px 16px", color: "var(--text)", fontSize: 14, fontFamily: "var(--font-body)", direction: "rtl", width: "100%", outline: "none", transition: "border-color 0.2s",
};

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<"landing" | "dashboard" | "stats" | "onboarding">("landing");
  const [reviews, setReviews] = useState<Review[]>(DEMO_REVIEWS);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [activeReview, setActiveReview] = useState<Review | null>(null);
  const [aiReply, setAiReply] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [filter, setFilter] = useState("all");
  const [whatsappModal, setWhatsappModal] = useState(false);
  const [notif, setNotif] = useState<Notif | null>(null);
  const [leadForm, setLeadForm] = useState({ name: "", phone: "", email: "" });
  const [leadSent, setLeadSent] = useState(false);
  const [paddle, setPaddle] = useState<Paddle | undefined>();
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingData, setOnboardingData] = useState({ businessName: "", category: "", phone: "", email: "" });
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [accountId, setAccountId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [analysisModal, setAnalysisModal] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(1);
  const [analysisForm, setAnalysisForm] = useState({ company: "", industry: "", website: "", email: "", phone: "", focus: "" });
  const [analysisSubmitted, setAnalysisSubmitted] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);

  const showNotif = (msg: string, color = "#22d3a0", icon = "✓") => {
    setNotif({ msg, color, icon });
    setTimeout(() => setNotif(null), 3500);
  };

  // ── Scroll ──
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Restore session ──
  useEffect(() => {
    const stored = localStorage.getItem("repute_user");
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setGoogleUser(u);
        setIsDemoMode(false);
        const loc = sessionStorage.getItem("gbp_location");
        if (loc) setLocationId(loc);
      } catch { /* ignore */ }
    }
  }, []);

  // ── Paddle ──
  useEffect(() => {
    initializePaddle({
      environment: "sandbox",
      token: PADDLE_TOKEN,
      eventCallback: (data) => {
        if (data.name === "checkout.completed")
          showNotif("התשלום בוצע בהצלחה! 🎉", "#22d3a0", "🎉");
      },
    }).then((p) => { if (p) setPaddle(p); });
  }, []);

  // ── Google Login ──
  const handleGoogleLogin = () => {
    const scope = ["openid", "email", "profile", "https://www.googleapis.com/auth/business.manage"].join(" ");
    const redirectUri = window.location.origin + window.location.pathname;
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scope)}&prompt=consent`;
    window.location.href = url;
  };

  // ── Handle OAuth redirect ──
  useEffect(() => {
    const accessToken = sessionStorage.getItem("pending_token");
    if (!accessToken) return;
    sessionStorage.removeItem("pending_token");

    fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((info) => {
        const user: GoogleUser = {
          name: info.name,
          email: info.email,
          picture: info.picture,
          accessToken,
        };
        setGoogleUser(user);
        localStorage.setItem("repute_user", JSON.stringify(user));
        localStorage.setItem("google_access_token", accessToken);
        setIsDemoMode(false);
        setPage("onboarding");
        fetchBusinessAccounts(accessToken);
      })
      .catch(() => showNotif("שגיאה בהתחברות לגוגל", "#f87171", "✕"));
  }, []);

  // Implicit flow — no refresh tokens, just return the stored access token
  const getValidToken = async (): Promise<string | null> => {
    return localStorage.getItem("google_access_token");
  };

  const fetchBusinessAccounts = async (token: string) => {
    const cached = sessionStorage.getItem("gbp_location");
    if (cached) { setLocationId(cached); return; }
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 429) { showNotif("Google API עמוס – נסה שוב בעוד דקה", "#fbbf24", "⏳"); return; }
      const data = await res.json();
      const accounts = data.accounts || [];
      if (accounts.length > 0) {
        setAccountId(accounts[0].name);
        await fetchLocations(token, accounts[0].name);
      } else showNotif("לא נמצאו עסקים בחשבון זה", "#fbbf24", "⚠");
    } catch { showNotif("לא ניתן לטעון חשבונות עסקיים", "#f87171", "✕"); }
  };

  const fetchLocations = async (token: string, aid: string) => {
    try {
      const res = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${aid}/locations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 429) { showNotif("Google API עמוס", "#fbbf24", "⏳"); return; }
      const data = await res.json();
      const locs = data.locations || [];
      if (locs.length > 0) {
        setLocationId(locs[0].name);
        sessionStorage.setItem("gbp_location", locs[0].name);
        showNotif("עסק נמצא ומחובר!", "#22d3a0", "✓");
      } else showNotif("לא נמצאו מיקומים לעסק", "#fbbf24", "⚠");
    } catch { showNotif("לא ניתן לטעון מיקומים", "#f87171", "✕"); }
  };

  const fetchRealReviews = useCallback(async () => {
    if (!googleUser || !locationId) return;
    setLoadingReviews(true);
    try {
      const token = await getValidToken();
      if (!token) { showNotif("נא להתחבר מחדש", "#f87171", "✕"); setLoadingReviews(false); return; }
      const res = await fetch(`https://mybusiness.googleapis.com/v4/${locationId}/reviews`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const raw = data.reviews || [];
      if (raw.length === 0) { setReviews([]); showNotif("אין ביקורות עדיין", "#fbbf24", "⚠"); setLoadingReviews(false); return; }
      const map: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
      const mapped: Review[] = raw.map((r: any, i: number) => {
        const rating = map[r.starRating] || 3;
        const name = r.reviewer?.displayName || "אנונימי";
        return { id: i + 1, reviewId: r.reviewId, author: name, rating, text: r.comment || "(ללא טקסט)", source: "Google", date: fmtDate(r.createTime), sentiment: detectSentiment(rating), replied: !!r.reviewReply, avatar: name[0] };
      });
      setReviews(mapped);
      showNotif(`נטענו ${mapped.length} ביקורות אמיתיות!`, "#22d3a0", "✓");
    } catch { showNotif("שגיאה בטעינת ביקורות", "#f87171", "✕"); }
    setLoadingReviews(false);
  }, [googleUser, locationId]);

  useEffect(() => {
    if (locationId && googleUser && !isDemoMode) fetchRealReviews();
  }, [locationId, googleUser, isDemoMode, fetchRealReviews]);

  const getAIReply = async (review: Review) => {
    setActiveReview(review);
    setAiReply("");
    setReplyText("");
    setLoadingAI(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: `אתה עוזר לבעל עסק להשיב על ביקורת בצורה מקצועית ואישית. כתוב תשובה קצרה (2-3 משפטים) בעברית.\n\nביקורת: "${review.text}"\nדירוג: ${review.rating}/5\n\nכתוב רק את התשובה.` }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || AI_FALLBACKS[review.sentiment];
      setAiReply(text);
      setReplyText(text);
    } catch {
      const fb = AI_FALLBACKS[review.sentiment];
      setAiReply(fb);
      setReplyText(fb);
    }
    setLoadingAI(false);
  };

  const submitReply = () => {
    if (!activeReview) return;
    setReviews((prev) => prev.map((r) => (r.id === activeReview.id ? { ...r, replied: true } : r)));
    setActiveReview(null);
    showNotif("תגובה נשלחה לגוגל!", "#22d3a0", "✓");
  };

  const submitLead = async () => {
    if (!leadForm.name || !leadForm.phone) { showNotif("נא למלא שם וטלפון", "#fbbf24", "⚠"); return; }
    try {
      await fetch("https://formspree.io/f/mpqyqoed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...leadForm, source: "landing_bar" }) });
    } catch { /* ignore */ }
    setLeadSent(true);
  };

  const submitAnalysis = async () => {
    if (!analysisForm.email) { showNotif("נא להזין אימייל", "#fbbf24", "⚠"); return; }
    try {
      await fetch("https://formspree.io/f/mpqyqoed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...analysisForm, type: "analysis_request" }) });
    } catch { /* ignore */ }
    setAnalysisSubmitted(true);
  };

  const avgRating = reviews.length ? (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1) : "0.0";
  const positive = reviews.filter((r) => r.sentiment === "positive").length;
  const negative = reviews.filter((r) => r.sentiment === "negative").length;
  const unreplied = reviews.filter((r) => !r.replied).length;
  const filtered = filter === "all" ? reviews : reviews.filter((r) => r.sentiment === filter);
  const replyRate = reviews.length ? Math.round((reviews.filter((r) => r.replied).length / reviews.length) * 100) : 0;

  // ────────────────────────────────────────────────────────────────────────────
  // STATS PAGE
  // ────────────────────────────────────────────────────────────────────────────
  if (page === "stats")
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-body)" }}>
        <Notification notif={notif} />
        <Nav page={page} setPage={setPage} googleUser={googleUser} isDemoMode={isDemoMode} scrollY={0} onGoogleLogin={handleGoogleLogin} onDemo={() => { setIsDemoMode(true); setReviews(DEMO_REVIEWS); setPage("dashboard"); }} />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, color: "var(--accent2)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>סטטיסטיקות</div>
            <h1 style={{ fontSize: 32, fontWeight: 800, fontFamily: "var(--font-display)" }}>ניתוח ביצועים</h1>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
            {[
              { label: "ציון NPS", value: "72", icon: "🎯", color: "var(--accent)" },
              { label: "שיעור תגובה", value: `${replyRate}%`, icon: "💬", color: "var(--green)" },
              { label: "זמן תגובה ממוצע", value: "2.4h", icon: "⚡", color: "var(--yellow)" },
              { label: "ביקורות השבוע", value: "13", icon: "📈", color: "var(--accent2)" },
            ].map((k) => (
              <div key={k.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{k.icon}</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: k.color, fontFamily: "var(--font-display)", marginBottom: 4 }}>{k.value}</div>
                <div style={{ color: "var(--sub)", fontSize: 13 }}>{k.label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>ביקורות לאורך השבוע</div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={WEEKLY_DATA}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c6ef5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7c6ef5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="day" stroke="#5a5a7a" fontSize={12} />
                <YAxis stroke="#5a5a7a" fontSize={12} />
                <Tooltip contentStyle={{ background: "#0c0c14", border: "1px solid #2a2a3e", borderRadius: 10, fontFamily: "Heebo" }} />
                <Area type="monotone" dataKey="ביקורות" stroke="#7c6ef5" strokeWidth={2} fill="url(#g1)" />
                <Line type="monotone" dataKey="חיוביות" stroke="#22d3a0" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="שליליות" stroke="#f87171" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>התפלגות סנטימנט</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={PIE_DATA} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={4}>
                    {PIE_DATA.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#0c0c14", border: "1px solid #2a2a3e", borderRadius: 10 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 12 }}>
                {PIE_DATA.map((d) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.color }} />
                    <span style={{ fontSize: 12, color: "var(--sub)" }}>{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>תובנות AI 🤖</div>
              {[
                { icon: "🔴", text: "3 ביקורות מזכירות 'המתנה ארוכה' — בעיה חוזרת!" },
                { icon: "🟢", text: "האווירה והמחירים מקבלים ציונים גבוהים עקביים" },
                { icon: "🟡", text: "שיעור התגובה ירד ב-15% לעומת שבוע שעבר" },
                { icon: "💡", text: "מומלץ לשלוח בקשות ביקורת ביום חמישי" },
              ].map((ins, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 16 }}>{ins.icon}</span>
                  <span style={{ color: "var(--sub)", fontSize: 14, lineHeight: 1.6 }}>{ins.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );

  // ────────────────────────────────────────────────────────────────────────────
  // ONBOARDING PAGE
  // ────────────────────────────────────────────────────────────────────────────
  if (page === "onboarding")
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-body)", display: "flex", flexDirection: "column" }}>
        <Notification notif={notif} />
        <nav style={{ padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Logo />
          <div style={{ color: "var(--sub)", fontSize: 14 }}>{googleUser ? `שלום, ${googleUser.name} 👋` : "הגדרת חשבון"}</div>
        </nav>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
          <div style={{ width: "100%", maxWidth: 500 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ flex: 1 }}>
                  <div style={{ height: 3, borderRadius: 3, background: i <= onboardingStep ? "var(--accent)" : "var(--border2)", transition: "background 0.3s" }} />
                  <div style={{ fontSize: 11, color: i <= onboardingStep ? "var(--accent2)" : "var(--sub2)", marginTop: 6, fontWeight: 600 }}>
                    {i === 1 ? "פרטי עסק" : i === 2 ? "חיבור Google" : "התראות"}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 32 }}>
              {onboardingStep === 1 && (
                <div>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>🏢</div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 8 }}>פרטי העסק שלך</h2>
                  <p style={{ color: "var(--sub)", fontSize: 14, marginBottom: 28 }}>נתאים את המערכת לעסק שלך</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <input style={inputStyle} placeholder="שם העסק *" value={onboardingData.businessName} onChange={(e) => setOnboardingData({ ...onboardingData, businessName: e.target.value })} onFocus={(e) => (e.target.style.borderColor = "var(--accent)")} onBlur={(e) => (e.target.style.borderColor = "var(--border2)")} />
                    <input style={inputStyle} placeholder="טלפון" value={onboardingData.phone} onChange={(e) => setOnboardingData({ ...onboardingData, phone: e.target.value })} onFocus={(e) => (e.target.style.borderColor = "var(--accent)")} onBlur={(e) => (e.target.style.borderColor = "var(--border2)")} />
                    <select style={inputStyle} value={onboardingData.category} onChange={(e) => setOnboardingData({ ...onboardingData, category: e.target.value })}>
                      <option value="">קטגוריית העסק *</option>
                      <option value="restaurant">מסעדה / קפה</option>
                      <option value="beauty">יופי וספא</option>
                      <option value="health">רפואה ובריאות</option>
                      <option value="retail">חנות קמעונאית</option>
                      <option value="service">שירותים מקצועיים</option>
                      <option value="other">אחר</option>
                    </select>
                  </div>
                  <button style={{ ...btnPrimary, width: "100%", marginTop: 24 }} onClick={() => onboardingData.businessName && onboardingData.category && setOnboardingStep(2)}>המשך →</button>
                </div>
              )}
              {onboardingStep === 2 && (
                <div>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 8 }}>חיבור Google Business</h2>
                  {googleUser ? (
                    <>
                      <div style={{ background: "rgba(34,211,160,0.08)", border: "1px solid rgba(34,211,160,0.25)", borderRadius: "var(--radius-sm)", padding: 16, marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
                        <img src={googleUser.picture} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                        <div>
                          <div style={{ fontWeight: 700, color: "var(--green)", fontSize: 14 }}>✓ מחובר ל-Google</div>
                          <div style={{ color: "var(--sub)", fontSize: 13 }}>{googleUser.email}</div>
                        </div>
                      </div>
                      {locationId ? (
                        <div style={{ color: "var(--green)", fontSize: 14, marginBottom: 16 }}>✓ עסק נמצא ומחובר!</div>
                      ) : (
                        <div style={{ color: "var(--sub)", fontSize: 14, marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}><Spinner /> מחפש עסקים...</div>
                      )}
                      <button style={{ ...btnPrimary, width: "100%" }} onClick={() => setOnboardingStep(3)}>המשך →</button>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <p style={{ color: "var(--sub)", fontSize: 14, marginBottom: 8 }}>כדי לקבל ביקורות אמיתיות נצטרך גישה לפרופיל שלך</p>
                      <GoogleBtn onClick={handleGoogleLogin} />
                      <button style={{ ...btnGhost, width: "100%" }} onClick={() => setOnboardingStep(3)}>דלג — אחבר מאוחר יותר</button>
                    </div>
                  )}
                </div>
              )}
              {onboardingStep === 3 && (
                <div>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>🔔</div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 8 }}>הגדרת התראות</h2>
                  <p style={{ color: "var(--sub)", fontSize: 14, marginBottom: 28 }}>איך תרצה לקבל התראות על ביקורות חדשות?</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <input style={inputStyle} placeholder="אימייל להתראות *" value={onboardingData.email} onChange={(e) => setOnboardingData({ ...onboardingData, email: e.target.value })} onFocus={(e) => (e.target.style.borderColor = "var(--accent)")} onBlur={(e) => (e.target.style.borderColor = "var(--border2)")} />
                  </div>
                  <button style={{ ...btnPrimary, width: "100%", marginTop: 24 }} onClick={() => setPage("dashboard")}>סיים והתחל 🚀</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );

  // ────────────────────────────────────────────────────────────────────────────
  // DASHBOARD PAGE
  // ────────────────────────────────────────────────────────────────────────────
  if (page === "dashboard")
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-body)" }}>
        <Notification notif={notif} />
        <Nav page={page} setPage={setPage} googleUser={googleUser} isDemoMode={isDemoMode} scrollY={0} onGoogleLogin={handleGoogleLogin}
          onDemo={() => { setIsDemoMode(true); setReviews(DEMO_REVIEWS); setPage("dashboard"); }}
          extraRight={
            <div style={{ display: "flex", gap: 8 }}>
              {!isDemoMode && locationId && (<button style={{ ...btnGhost, padding: "8px 14px", fontSize: 12 }} onClick={fetchRealReviews}>↻ רענן</button>)}
              <button style={{ ...btnGhost, padding: "8px 14px", fontSize: 12 }} onClick={() => setPage("stats")}>📊 סטטיסטיקות</button>
            </div>
          }
        />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
          {isDemoMode && (
            <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: "var(--radius-sm)", padding: "12px 20px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div style={{ color: "#fbbf24", fontSize: 14, fontWeight: 600 }}>🎭 מצב דמו — מציג נתונים לדוגמה</div>
              <GoogleBtn onClick={handleGoogleLogin} text="חבר את העסק האמיתי שלך" />
            </div>
          )}
          {loadingReviews ? (
            <div style={{ textAlign: "center", padding: 80 }}>
              <div style={{ fontSize: 48, marginBottom: 16, animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--sub)" }}>טוען ביקורות...</div>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 28 }}>
                {[
                  { val: `${avgRating} ★`, label: "דירוג ממוצע", color: "#fbbf24" },
                  { val: reviews.length, label: "סך ביקורות", color: "var(--accent2)" },
                  { val: positive, label: "חיוביות", color: "var(--green)" },
                  { val: negative, label: "שליליות", color: "var(--red)" },
                  { val: unreplied, label: "ממתינות לתגובה", color: "#fbbf24" },
                  { val: `${replyRate}%`, label: "שיעור תגובה", color: "var(--accent)" },
                ].map(({ val, label, color }) => (
                  <div key={label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "18px 16px", textAlign: "center", transition: "border-color 0.2s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
                    <div style={{ fontSize: 30, fontWeight: 900, color, fontFamily: "var(--font-display)" }}>{val}</div>
                    <div style={{ color: "var(--sub)", fontSize: 12, marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {[{ key: "all", label: "הכל" }, { key: "positive", label: "⭐ חיוביות" }, { key: "negative", label: "⚠ שליליות" }, { key: "neutral", label: "• ניטרליות" }].map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)} style={{ ...btnGhost, padding: "8px 14px", fontSize: 13, background: filter === f.key ? "rgba(124,110,245,0.15)" : "transparent", borderColor: filter === f.key ? "var(--accent)" : "var(--border)", color: filter === f.key ? "var(--accent2)" : "var(--sub)" }}>{f.label}</button>
                  ))}
                </div>
                <button style={btnPrimary} onClick={() => setWhatsappModal(true)}>📱 שלח בקשת ביקורת</button>
              </div>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: 80, color: "var(--sub)" }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>⭐</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>אין ביקורות</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {filtered.map((review) => (
                    <div key={review.id} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRight: `3px solid ${review.sentiment === "negative" ? "var(--red)" : review.sentiment === "positive" ? "var(--green)" : "var(--border2)"}`, borderRadius: "var(--radius)", padding: "20px 24px", transition: "all 0.2s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                        <div style={{ display: "flex", gap: 14, flex: 1 }}>
                          <Avatar letter={review.avatar || review.author[0]} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: 15 }}>{review.author}</span>
                              <Stars n={review.rating} />
                              <SentimentBadge s={review.sentiment} />
                              <span style={{ fontSize: 11, color: "var(--sub2)", background: "var(--bg3)", padding: "2px 8px", borderRadius: 100 }}>{review.source}</span>
                              {review.replied && (<span style={{ fontSize: 11, color: "var(--green)", background: "rgba(34,211,160,0.1)", padding: "2px 8px", borderRadius: 100 }}>✓ הושב</span>)}
                            </div>
                            <p style={{ color: "var(--sub)", fontSize: 14, lineHeight: 1.6, margin: "0 0 6px" }}>{review.text}</p>
                            <div style={{ color: "var(--sub2)", fontSize: 12 }}>{review.date}</div>
                          </div>
                        </div>
                        {!review.replied && (
                          <button style={{ ...btnPrimary, padding: "8px 16px", fontSize: 13, flexShrink: 0, whiteSpace: "nowrap" }} onClick={() => getAIReply(review)}>🤖 AI תגובה</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {activeReview && (
          <Modal onClose={() => setActiveReview(null)}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, marginBottom: 20 }}>🤖 תגובה עם AI</div>
            <div style={{ background: "var(--bg3)", borderRadius: "var(--radius-sm)", padding: 16, marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "center" }}>
                <Avatar letter={activeReview.avatar || activeReview.author[0]} size={32} />
                <span style={{ fontWeight: 700 }}>{activeReview.author}</span>
                <Stars n={activeReview.rating} />
              </div>
              <p style={{ color: "var(--sub)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>{activeReview.text}</p>
            </div>
            {loadingAI ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--accent2)", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                <Spinner />
                <div style={{ fontSize: 14, color: "var(--sub)" }}>Claude AI מנתח ומייצר תגובה...</div>
              </div>
            ) : (
              <>
                <div style={{ color: "var(--sub)", fontSize: 13, marginBottom: 8, fontWeight: 600 }}>תגובה מוצעת (ניתנת לעריכה):</div>
                <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} style={{ ...inputStyle, minHeight: 120, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button style={{ ...btnPrimary, flex: 1 }} onClick={submitReply}>שלח תגובה ל-Google ←</button>
                  <button style={btnGhost} onClick={() => setActiveReview(null)}>ביטול</button>
                </div>
              </>
            )}
          </Modal>
        )}
        {whatsappModal && (
          <Modal onClose={() => setWhatsappModal(false)}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, marginBottom: 20 }}>📱 בקשת ביקורת ב-WhatsApp</div>
            <div style={{ color: "var(--sub)", fontSize: 14, marginBottom: 16 }}>ההודעה הבאה תישלח ל-5 לקוחות אחרונים:</div>
            <div style={{ background: "#075E54", borderRadius: 16, padding: 20, marginBottom: 20 }}>
              <p style={{ color: "#fff", fontSize: 14, lineHeight: 1.7, margin: 0, direction: "rtl" }}>
                היי! 😊 תודה שבחרת ב{onboardingData.businessName || "העסק שלנו"}.<br />
                נשמח אם תוכל לשתף את חוויתך – ביקורת קצרה עוזרת לנו מאוד!<br />
                👉 [קישור לביקורת בגוגל]
              </p>
            </div>
            <div style={{ background: "rgba(34,211,160,0.08)", border: "1px solid rgba(34,211,160,0.2)", borderRadius: "var(--radius-sm)", padding: 12, marginBottom: 20, fontSize: 13, color: "var(--green)" }}>
              💡 פילטר חכם: לקוחות לא מרוצים מועברים לטופס פנימי ולא ל-Google
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...btnPrimary, flex: 1, background: "linear-gradient(135deg, #075E54, #128C7E)" }} onClick={() => { setWhatsappModal(false); showNotif("📱 בקשת ביקורת נשלחה ל-5 לקוחות!", "#22d3a0", "📱"); }}>שלח עכשיו</button>
              <button style={btnGhost} onClick={() => setWhatsappModal(false)}>ביטול</button>
            </div>
          </Modal>
        )}
      </div>
    );

  // ────────────────────────────────────────────────────────────────────────────
  // LANDING PAGE
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-body)", overflowX: "hidden" }}>
      <Notification notif={notif} />
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "10%", right: "5%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,110,245,0.08) 0%, transparent 70%)", animation: "orb 20s ease infinite" }} />
        <div style={{ position: "absolute", top: "50%", left: "5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(167,139,250,0.06) 0%, transparent 70%)", animation: "orb 25s ease infinite reverse" }} />
        <div style={{ position: "absolute", bottom: "10%", right: "20%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,121,249,0.05) 0%, transparent 70%)", animation: "pulse 8s ease infinite" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(124,110,245,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(124,110,245,0.03) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
      </div>
      <Nav page={page} setPage={setPage} googleUser={googleUser} isDemoMode={isDemoMode} scrollY={scrollY} onGoogleLogin={handleGoogleLogin} onDemo={() => { setIsDemoMode(true); setReviews(DEMO_REVIEWS); setPage("dashboard"); }} />
      <section ref={heroRef} style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "130px 24px 100px", maxWidth: 900, margin: "0 auto" }}>
        <div className="animate-fade-up-1" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(124,110,245,0.08)", border: "1px solid rgba(124,110,245,0.25)", borderRadius: 100, padding: "6px 18px", fontSize: 13, color: "var(--accent2)", marginBottom: 32, fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block", animation: "pulse 2s infinite" }} />
          מנהל הביקורות החכם ביותר לעסקים ישראליים
        </div>
        <h1 className="animate-fade-up-2" style={{ fontSize: "clamp(40px, 6.5vw, 76px)", fontWeight: 800, lineHeight: 1.08, margin: "0 0 28px", fontFamily: "var(--font-display)", letterSpacing: "-2px" }}>
          הביקורות שלך<br />
          <span style={{ background: "linear-gradient(135deg, #7c6ef5, #a78bfa, #e879f9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundSize: "200% auto", animation: "shimmer 5s linear infinite" }}>
            מנוהלות על ידי AI
          </span>
        </h1>
        <p className="animate-fade-up-3" style={{ color: "var(--sub)", fontSize: 19, lineHeight: 1.7, maxWidth: 580, margin: "0 auto 48px" }}>
          ריכוז ביקורות מ-Google, תגובות אוטומטיות חכמות, ושליחת בקשות ביקורת ללקוחות — הכל בדשבורד אחד.
        </p>
        <div className="animate-fade-up-4" style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={{ ...btnPrimary, padding: "16px 36px", fontSize: 16, borderRadius: 14 }} onClick={() => setAnalysisModal(true)}>🔍 נתח את הביקורות שלך — חינם</button>
          <button style={{ ...btnGhost, padding: "16px 36px", fontSize: 16, borderRadius: 14 }} onClick={() => { setIsDemoMode(true); setReviews(DEMO_REVIEWS); setPage("dashboard"); }}>ראה דמו חי ←</button>
        </div>
        <div className="animate-fade-up-5" style={{ display: "flex", justifyContent: "center", gap: 60, marginTop: 80, flexWrap: "wrap" }}>
          {[["3×", "יותר לקוחות עם 4.7+ כוכבים"], ["70%", "מהביקורות נשארות ללא מענה"], ["2 דק׳", "זמן תגובה ממוצע עם AI"]].map(([n, l]) => (
            <div key={n} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "var(--font-display)", background: "linear-gradient(135deg, var(--accent), var(--accent2))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{n}</div>
              <div style={{ color: "var(--sub)", fontSize: 13, marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
        <div className="animate-fade-up" style={{ marginTop: 80, animation: "float 6s ease infinite" }}><DashboardPreview /></div>
      </section>

      <section id="how" style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "100px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ color: "var(--accent2)", fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>תהליך פשוט</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, marginBottom: 16 }}>מתחילים תוך דקות</h2>
          <p style={{ color: "var(--sub)", fontSize: 16 }}>שלושה צעדים פשוטים לניהול ביקורות מקצועי</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 40 }}>
          {[
            { num: "01", icon: "🔗", title: "חבר את העסק", desc: "התחבר עם חשבון Google שלך וקבל גישה לכל הביקורות שלך תוך שניות." },
            { num: "02", icon: "🤖", title: "AI סורק ומנתח", desc: "המערכת מנתחת כל ביקורת, מזהה רגשות ויוצרת תגובות מקצועיות אוטומטית." },
            { num: "03", icon: "📈", title: "עקוב ושפר", desc: "קבל תובנות, התראות בזמן אמת, ושלח בקשות ביקורת ללקוחות מרוצים." },
          ].map((step, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ position: "relative", display: "inline-block", marginBottom: 20 }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--bg2)", border: "1px solid var(--border2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto" }}>{step.icon}</div>
                <div style={{ position: "absolute", top: -6, right: -8, background: "var(--accent)", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 100, padding: "2px 8px" }}>{step.num}</div>
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, marginBottom: 10 }}>{step.title}</div>
              <div style={{ color: "var(--sub)", fontSize: 14, lineHeight: 1.7 }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" style={{ position: "relative", zIndex: 1, maxWidth: 1060, margin: "0 auto", padding: "0 24px 100px" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ color: "var(--accent2)", fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>תכונות</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800 }}>כל מה שצריך</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {[
            { icon: "🔔", title: "התראות מיידיות", desc: "קבל התראה ברגע שנכנסת ביקורת חדשה — לא תפספס שום ביקורת שלילית." },
            { icon: "🤖", title: "תגובות עם Claude AI", desc: "Claude AI מנתח כל ביקורת ומציע תגובה מקצועית ואישית בתוך שניות." },
            { icon: "📱", title: "בקשות WhatsApp", desc: "שלח ללקוחות מרוצים בקשה אוטומטית לכתיבת ביקורת ב-Google." },
            { icon: "📊", title: "ניתוח סנטימנט", desc: "זהה דפוסים חוזרים, תלונות נפוצות, ומגמות בביקורות לאורך זמן." },
            { icon: "🎯", title: "פילטר חכם", desc: "לקוחות לא מרוצים מועברים לטופס פנימי — לא ל-Google." },
            { icon: "📈", title: "דוחות מתקדמים", desc: "ראה NPS, שיעור תגובה, ודירוג ממוצע עם גרפים ברורים." },
          ].map((f, i) => (
            <div key={i} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 28, cursor: "default", transition: "all 0.25s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "var(--glow)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>{f.icon}</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, marginBottom: 10 }}>{f.title}</div>
              <div style={{ color: "var(--sub)", fontSize: 14, lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto 100px", padding: "0 24px" }}>
        <div style={{ background: "linear-gradient(135deg, rgba(124,110,245,0.12), rgba(167,139,250,0.08))", border: "1px solid rgba(124,110,245,0.2)", borderRadius: 28, padding: "70px 40px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(124,110,245,0.15), transparent 60%)", pointerEvents: "none" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 800, marginBottom: 16, position: "relative" }}>מוכן לשלוט בביקורות שלך?</h2>
          <p style={{ color: "var(--sub)", fontSize: 17, marginBottom: 36, position: "relative" }}>הצטרף לעסקים שכבר מנהלים את הנוכחות שלהם בעידן ה-AI</p>
          <button style={{ ...btnPrimary, padding: "16px 44px", fontSize: 16, borderRadius: 14, position: "relative" }} onClick={() => setAnalysisModal(true)}>התחל ניתוח חינמי ←</button>
        </div>
      </section>

      <section id="pricing" style={{ position: "relative", zIndex: 1, maxWidth: 1000, margin: "0 auto", padding: "0 24px 100px" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ color: "var(--accent2)", fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>מחירים</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, marginBottom: 12 }}>מחירים פשוטים ושקופים</h2>
          <p style={{ color: "var(--sub)", fontSize: 16 }}>ללא עמלות נסתרות, ביטול בכל עת</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
          {[
            { name: "Starter", price: "149", color: "var(--accent)", priceId: "pri_01kka96tjh65e75g3etn2vqchv", features: ["ריכוז ביקורות Google", "התראות מיידיות", "דאשבורד בסיסי", "עד 50 ביקורות/חודש"] },
            { name: "Growth", price: "399", color: "var(--accent2)", priceId: "pri_01kka97ym1w3665awaf9atd196", popular: true, features: ["הכל ב-Starter", "AI תגובות אוטומטיות", "WhatsApp בקשות", "ניתוח סנטימנט מתקדם"] },
            { name: "Premium", price: "999", color: "#e879f9", priceId: "pri_01kka99rjvbb1wbmhdjzy6ccz5", features: ["הכל ב-Growth", "ניטור מתחרים", "דוחות מתקדמים", "ניהול מלא Done For You"] },
          ].map((plan) => (
            <div key={plan.name} style={{ background: "var(--bg2)", border: `1px solid ${(plan as any).popular ? "var(--accent)" : "var(--border)"}`, borderRadius: "var(--radius)", padding: "32px 28px", position: "relative", transition: "transform 0.3s" }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-6px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}>
              {(plan as any).popular && (
                <div style={{ position: "absolute", top: -14, right: 24, background: "linear-gradient(135deg, var(--accent), var(--accent2))", borderRadius: 100, padding: "4px 16px", fontSize: 12, fontWeight: 800 }}>🔥 הכי פופולרי</div>
              )}
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, marginBottom: 8 }}>{plan.name}</div>
              <div style={{ fontSize: 48, fontWeight: 900, color: plan.color, fontFamily: "var(--font-display)", lineHeight: 1, marginBottom: 4 }}>
                ₪{plan.price}<span style={{ fontSize: 15, color: "var(--sub)", fontFamily: "var(--font-body)" }}>/חודש</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 24px", display: "flex", flexDirection: "column", gap: 10 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ color: "var(--sub)", fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: plan.color }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <button style={{ ...btnPrimary, width: "100%", background: `linear-gradient(135deg, ${plan.color}, ${plan.color})`, boxShadow: `0 8px 24px ${plan.color}30` }}
                onClick={() => paddle?.Checkout.open({ items: [{ priceId: plan.priceId, quantity: 1 }] })}>
                בחר תוכנית ←
              </button>
            </div>
          ))}
        </div>
      </section>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(5,5,10,0.95)", backdropFilter: "blur(20px)", borderTop: "1px solid var(--border)", padding: "14px 24px", zIndex: 200, display: "flex", gap: 12, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        {leadSent ? (
          <div style={{ color: "var(--green)", fontWeight: 700, fontSize: 16 }}>✓ תודה! ניצור איתך קשר בקרוב 🎉</div>
        ) : (
          <>
            <span style={{ color: "var(--text)", fontWeight: 700, fontSize: 14 }}>🎯 קבל דמו חינמי:</span>
            {[{ ph: "שם", key: "name", w: "120px" }, { ph: "טלפון", key: "phone", w: "130px" }, { ph: "אימייל", key: "email", w: "160px" }].map(({ ph, key, w }) => (
              <input key={key} placeholder={ph} value={(leadForm as any)[key]} onChange={(e) => setLeadForm({ ...leadForm, [key]: e.target.value })} style={{ ...inputStyle, width: w, direction: "rtl" }} onFocus={(e) => (e.target.style.borderColor = "var(--accent)")} onBlur={(e) => (e.target.style.borderColor = "var(--border2)")} />
            ))}
            <button style={{ ...btnPrimary, padding: "11px 24px" }} onClick={submitLead}>שלח ←</button>
          </>
        )}
      </div>

      <div style={{ textAlign: "center", padding: "0 24px 80px", color: "var(--sub2)", fontSize: 12, position: "relative", zIndex: 1 }}>© 2025 ReputeAI · כל הזכויות שמורות</div>

      {analysisModal && (
        <Modal onClose={() => { setAnalysisModal(false); setAnalysisStep(1); setAnalysisSubmitted(false); }}>
          {analysisSubmitted ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 72, marginBottom: 20 }}>🎉</div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, marginBottom: 12 }}>הניתוח התחיל!</h3>
              <p style={{ color: "var(--sub)", fontSize: 15, lineHeight: 1.7, marginBottom: 24 }}>אנחנו מנתחים את הביקורות של העסק שלך. תקבל דוח מפורט תוך 24 שעות לאימייל.</p>
              <button style={btnPrimary} onClick={() => { setAnalysisModal(false); setAnalysisSubmitted(false); }}>סגור</button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: "var(--accent2)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>ניתוח חינמי</div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>ניתוח ביקורות חינמי</h3>
                <p style={{ color: "var(--sub)", fontSize: 14 }}>נבדוק כיצד הביקורות שלך נראות ומה אפשר לשפר — ללא עלות.</p>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                {[1, 2].map((i) => (<div key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: i <= analysisStep ? "var(--accent)" : "var(--border2)", transition: "background 0.3s" }} />))}
              </div>
              {analysisStep === 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <GoogleBtn onClick={handleGoogleLogin} text="חבר Google Business — תוצאות אוטומטיות" />
                  <div style={{ textAlign: "center", color: "var(--sub2)", fontSize: 13 }}>— או מלא ידנית —</div>
                  <input style={inputStyle} placeholder="שם החברה *" value={analysisForm.company} onChange={(e) => setAnalysisForm({ ...analysisForm, company: e.target.value })} onFocus={(e) => (e.target.style.borderColor = "var(--accent)")} onBlur={(e) => (e.target.style.borderColor = "var(--border2)")} />
                  <select style={inputStyle} value={analysisForm.industry} onChange={(e) => setAnalysisForm({ ...analysisForm, industry: e.target.value })}>
                    <option value="">תחום עיסוק *</option>
                    <option>מסעדה / קפה</option><option>יופי וספא</option><option>רפואה ובריאות</option><option>חנות קמעונאית</option><option>שירותים מקצועיים</option><option>אחר</option>
                  </select>
                  <input style={inputStyle} placeholder="כתובת אתר (אופציונלי)" value={analysisForm.website} onChange={(e) => setAnalysisForm({ ...analysisForm, website: e.target.value })} onFocus={(e) => (e.target.style.borderColor = "var(--accent)")} onBlur={(e) => (e.target.style.borderColor = "var(--border2)")} />
                  <button style={{ ...btnPrimary, width: "100%", marginTop: 4 }} onClick={() => analysisForm.company && analysisForm.industry && setAnalysisStep(2)}>המשך →</button>
                </div>
              )}
              {analysisStep === 2 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <input style={inputStyle} placeholder="אימייל *" value={analysisForm.email} onChange={(e) => setAnalysisForm({ ...analysisForm, email: e.target.value })} onFocus={(e) => (e.target.style.borderColor = "var(--accent)")} onBlur={(e) => (e.target.style.borderColor = "var(--border2)")} />
                  <input style={inputStyle} placeholder="טלפון (אופציונלי)" value={analysisForm.phone} onChange={(e) => setAnalysisForm({ ...analysisForm, phone: e.target.value })} onFocus={(e) => (e.target.style.borderColor = "var(--accent)")} onBlur={(e) => (e.target.style.borderColor = "var(--border2)")} />
                  <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} placeholder="על מה תרצה שנתמקד? (אופציונלי)" value={analysisForm.focus} onChange={(e) => setAnalysisForm({ ...analysisForm, focus: e.target.value })} />
                  <div style={{ background: "rgba(124,110,245,0.06)", border: "1px solid rgba(124,110,245,0.15)", borderRadius: "var(--radius-sm)", padding: 12, fontSize: 13, color: "var(--accent2)" }}>🔒 המידע שלך מאובטח ולא יועבר לצד שלישי</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <button style={{ ...btnGhost, padding: "12px 20px" }} onClick={() => setAnalysisStep(1)}>← חזור</button>
                    <button style={{ ...btnPrimary, flex: 1 }} onClick={submitAnalysis}>שלח וקבל ניתוח 🚀</button>
                  </div>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── Shared styles ──────────────────────────────────────────────────────────────
const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c6ef5, #a78bfa)", border: "none", color: "#fff", borderRadius: "var(--radius-sm)", padding: "11px 22px", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "var(--font-body)", transition: "all 0.2s", boxShadow: "0 4px 20px rgba(124,110,245,0.3)",
};

const btnGhost: React.CSSProperties = {
  background: "transparent", border: "1px solid var(--border2)", color: "var(--text)", borderRadius: "var(--radius-sm)", padding: "11px 22px", cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "var(--font-body)", transition: "all 0.2s",
};

const Logo = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
    <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #7c6ef5, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⭐</div>
    <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, background: "linear-gradient(135deg, #7c6ef5, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>ReputeAI</span>
  </div>
);

const Nav = ({ page, setPage, googleUser, isDemoMode, scrollY, onGoogleLogin, onDemo, extraRight }: any) => (
  <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: scrollY > 60 ? "1px solid var(--border)" : "1px solid transparent", background: scrollY > 60 ? "rgba(5,5,10,0.95)" : "transparent", backdropFilter: scrollY > 60 ? "blur(20px)" : "none", position: "sticky", top: 0, zIndex: 100, transition: "all 0.3s" }}>
    <div onClick={() => setPage("landing")} style={{ cursor: "pointer" }}><Logo /></div>
    {page === "landing" && (
      <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
        {[["#features", "תכונות"], ["#how", "איך זה עובד"], ["#pricing", "מחירים"]].map(([href, label]) => (
          <a key={href} href={href} style={{ color: "var(--sub)", textDecoration: "none", fontSize: 14, fontWeight: 600, transition: "color 0.2s" }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "var(--text)")}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "var(--sub)")}>{label}</a>
        ))}
      </div>
    )}
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      {extraRight}
      {page === "dashboard" || page === "stats" ? (
        <>
          <div style={{ background: isDemoMode ? "rgba(251,191,36,0.1)" : "rgba(34,211,160,0.1)", border: `1px solid ${isDemoMode ? "rgba(251,191,36,0.3)" : "rgba(34,211,160,0.3)"}`, borderRadius: 100, padding: "4px 12px", fontSize: 12, color: isDemoMode ? "#fbbf24" : "#22d3a0", fontWeight: 700 }}>
            {isDemoMode ? "🎭 דמו" : "✓ חי"}
          </div>
          {googleUser && (<img src={googleUser.picture} alt="" style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--accent)" }} />)}
          <button style={{ ...btnGhost, padding: "8px 14px", fontSize: 13 }} onClick={() => setPage("landing")}>← חזור לאתר</button>
        </>
      ) : (
        <>
          <button style={{ ...btnGhost, padding: "9px 18px", fontSize: 14 }} onClick={onDemo}>כניסה לדמו</button>
          <GoogleBtn onClick={onGoogleLogin} text="התחבר עם Google" />
        </>
      )}
    </div>
  </nav>
);

const Modal = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24, backdropFilter: "blur(12px)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: "var(--radius)", padding: 32, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", position: "relative", animation: "fadeUp 0.3s ease" }}>
      <button onClick={onClose} style={{ position: "absolute", top: 16, left: 16, background: "transparent", border: "none", color: "var(--sub)", fontSize: 20, cursor: "pointer", lineHeight: 1, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, transition: "background 0.2s" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>✕</button>
      {children}
    </div>
  </div>
);

const DashboardPreview = () => (
  <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 20, padding: 20, maxWidth: 700, margin: "0 auto", boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 60px rgba(124,110,245,0.1)", textAlign: "right" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {["#f87171", "#fbbf24", "#22d3a0"].map((c) => (<div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", fontFamily: "var(--font-display)" }}>ReputeAI Dashboard</div>
      <div style={{ width: 60, height: 6, borderRadius: 3, background: "var(--border)" }} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
      {[["4.8 ★", "#fbbf24"], ["24", "#a78bfa"], ["18", "#22d3a0"], ["6", "#f87171"]].map(([v, c], i) => (
        <div key={i} style={{ background: "var(--bg3)", borderRadius: 10, padding: "12px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: c as string, fontFamily: "var(--font-display)" }}>{v as string}</div>
        </div>
      ))}
    </div>
    {[
      { r: 5, c: "var(--green)", txt: "שירות מדהים! ממליץ בחום..." },
      { r: 2, c: "var(--red)", txt: "המתנה ארוכה מדי..." },
      { r: 4, c: "var(--accent)", txt: "טוב מאוד, אבל..." },
    ].map((rv, i) => (
      <div key={i} style={{ background: "var(--bg3)", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", borderRight: `3px solid ${rv.c}` }}>
        <div style={{ fontSize: 12, color: "var(--sub)" }}>{rv.txt}</div>
        <div style={{ fontSize: 12, color: "#fbbf24" }}>{"★".repeat(rv.r)}</div>
      </div>
    ))}
  </div>
);

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Copy, Share2, Info, X } from "lucide-react";
import { toast } from "sonner";

export type BetSuccessDetail = {
  betId?: string;
  trackingId?: string;
  bookingCode?: string;
  stake: number;
  potentialWin: number;
  kind?: string;
};

const EVENT = "lsl:bet-success";

/** Fire the pop-out from anywhere after a successful stake. */
export function showBetSuccess(detail: BetSuccessDetail) {
  window.dispatchEvent(new CustomEvent<BetSuccessDetail>(EVENT, { detail }));
}

export function BetSuccessPopout() {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<BetSuccessDetail | null>(null);

  useEffect(() => {
    function onEvent(e: Event) {
      const d = (e as CustomEvent<BetSuccessDetail>).detail;
      if (d) setDetail(d);
    }
    window.addEventListener(EVENT, onEvent as EventListener);
    return () => window.removeEventListener(EVENT, onEvent as EventListener);
  }, []);

  if (!detail) return null;

  const close = () => setDetail(null);
  const code = detail.bookingCode || detail.trackingId || "";

  function copy(t: string) {
    navigator.clipboard.writeText(t);
    toast.success("Copied");
  }
  async function share() {
    const url = `${window.location.origin}/?code=${detail!.bookingCode || ""}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `ECB Booking ${code}`, url });
        return;
      } catch {
        /* ignore */
      }
    }
    navigator.clipboard.writeText(url);
    toast.success("Share link copied");
  }
  function viewTicket() {
    if (detail!.betId) navigate({ to: "/ticket/$id", params: { id: detail!.betId } });
    close();
  }
  function openBets() {
    navigate({ to: "/dashboard" });
    close();
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-4 animate-fade-in" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Close" onClick={close} />
      <div className="relative w-full max-w-lg rounded-3xl border border-emerald-500/30 bg-[#161d2b] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] animate-scale-in">
        <button onClick={close} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 pr-6">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500 shadow-[0_0_24px_-4px_rgba(16,185,129,0.8)]">
            <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
          </span>
          <h2 className="text-2xl font-black tracking-tight text-white">Bet Successful</h2>
        </div>

        <div className="mt-5 space-y-3.5 text-[15px]">
          <Row label="Total Stake">
            <span className="font-bold text-white tabular-nums">{Number(detail.stake).toLocaleString()}</span>
          </Row>
          <Row label="Potential Win">
            <span className="font-bold text-emerald-400 tabular-nums">
              {Number(detail.potentialWin).toLocaleString()}
            </span>
          </Row>

          {code && (
            <Row
              label={
                <span className="inline-flex items-center gap-1.5 font-extrabold tracking-wide text-white">
                  {code}
                  <Info className="h-4 w-4 text-muted-foreground" />
                </span>
              }
            >
              <div className="flex items-center gap-3">
                <button onClick={share} className="text-muted-foreground hover:text-emerald-400">
                  <Share2 className="h-5 w-5" />
                </button>
                <button onClick={() => copy(code)} className="text-muted-foreground hover:text-emerald-400">
                  <Copy className="h-5 w-5" />
                </button>
                <button onClick={viewTicket} className="font-bold text-emerald-400 hover:text-emerald-300">
                  View
                </button>
              </div>
            </Row>
          )}

          <Row label="Custom Code">
            <button onClick={() => code && copy(code)} className="font-bold text-emerald-400 hover:text-emerald-300">
              Assign Code
            </button>
          </Row>
          <Row label="Reward Progress">
            <button onClick={openBets} className="font-bold text-emerald-400 hover:text-emerald-300">
              View
            </button>
          </Row>
          <Row label="Open Bets">
            <button onClick={openBets} className="font-bold text-emerald-400 hover:text-emerald-300">
              View
            </button>
          </Row>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}

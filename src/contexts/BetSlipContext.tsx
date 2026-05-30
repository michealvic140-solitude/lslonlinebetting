import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export interface SlipSelection {
  match_id: string;
  match_name: string;
  market_id: string;
  market_name: string;
  odd_id: string;
  selection_label: string;
  odds: number;
  is_virtual?: boolean;
  virtual_round_batch_id?: string | null;
}

interface Ctx {
  selections: SlipSelection[];
  add: (s: SlipSelection) => void;
  remove: (oddId: string) => void;
  clear: () => void;
  reorder: (from: number, to: number) => void;
  totalOdds: number;
  stake: number;
  setStake: (n: number) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}

const C = createContext<Ctx | undefined>(undefined);
const STORAGE_KEY = "lsl-betslip-v1";

export const BetSlipProvider = ({ children }: { children: ReactNode }) => {
  const [selections, setSelections] = useState<SlipSelection[]>([]);
  const [stake, setStake] = useState<number>(2_000_000);
  const [open, setOpen] = useState(false);

  // load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p.selections)) setSelections(p.selections);
        if (typeof p.stake === "number") setStake(p.stake);
      }
    } catch {}
  }, []);
  // save
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ selections, stake })); } catch {}
  }, [selections, stake]);

  const add = (s: SlipSelection) =>
    setSelections((prev) => {
      const filtered = prev.filter((x) => x.match_id !== s.match_id);
      const next = [...filtered, s];
      return next;
    });
  const remove = (oddId: string) => setSelections((p) => p.filter((s) => s.odd_id !== oddId));
  const clear = () => setSelections([]);
  const reorder = (from: number, to: number) => setSelections((p) => {
    if (from === to || from < 0 || to < 0 || from >= p.length || to >= p.length) return p;
    const arr = [...p]; const [it] = arr.splice(from, 1); arr.splice(to, 0, it); return arr;
  });
  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  return <C.Provider value={{ selections, add, remove, clear, reorder, totalOdds, stake, setStake, open, setOpen }}>{children}</C.Provider>;
};

export const useBetSlip = () => {
  const c = useContext(C);
  if (!c) throw new Error("useBetSlip must be in BetSlipProvider");
  return c;
};

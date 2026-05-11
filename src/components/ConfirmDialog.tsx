import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";

type ConfirmResult = boolean | { confirmed: true; value: string; checked: boolean };
type Opts = { title: string; description?: string; confirmText?: string; cancelText?: string; tone?: "default" | "danger"; inputLabel?: string; inputPlaceholder?: string; inputRequired?: boolean; checkboxLabel?: string };
type Resolver = (v: ConfirmResult) => void;

const Ctx = createContext<(o: Opts) => Promise<ConfirmResult>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<Opts | null>(null);
  const [resolver, setResolver] = useState<Resolver | null>(null);
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);

  const confirm = useCallback((o: Opts) => {
    setOpts(o);
    setValue("");
    setChecked(false);
    return new Promise<ConfirmResult>((res) => setResolver(() => res));
  }, []);

  const close = (v: boolean) => { resolver?.(v); setResolver(null); setOpts(null); setValue(""); setChecked(false); };
  const submit = () => {
    if (opts?.inputRequired && !value.trim()) return;
    if (opts?.inputLabel || opts?.checkboxLabel) resolver?.({ confirmed: true, value: value.trim(), checked });
    else resolver?.(true);
    setResolver(null); setOpts(null); setValue(""); setChecked(false);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onOpenChange={(o) => !o && close(false)}>
        <DialogContent className="glass-strong border-primary/30 max-w-md backdrop-blur-2xl shadow-luxury overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-gold" />
          <DialogHeader>
            <div className={`h-12 w-12 rounded-full grid place-items-center mb-2 ${opts?.tone === "danger" ? "bg-destructive/20" : "bg-primary/20"}`}>
              <AlertTriangle className={`h-6 w-6 ${opts?.tone === "danger" ? "text-destructive" : "text-primary"}`} />
            </div>
            <DialogTitle className="text-xl">{opts?.title}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{opts?.description}</DialogDescription>
          </DialogHeader>
          {(opts?.inputLabel || opts?.checkboxLabel) && (
            <div className="space-y-3">
              {opts?.inputLabel && (
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">{opts.inputLabel}</label>
                  <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={opts.inputPlaceholder} className="mt-1 min-h-24" />
                  {opts.inputRequired && !value.trim() && <p className="text-[10px] text-destructive mt-1">Required</p>}
                </div>
              )}
              {opts?.checkboxLabel && (
                <label className="flex items-center gap-2 rounded-lg border border-border bg-background/30 p-3 text-sm">
                  <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} />
                  {opts.checkboxLabel}
                </label>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => close(false)}>{opts?.cancelText ?? "Cancel"}</Button>
            <Button variant={opts?.tone === "danger" ? "destructive" : "default"} onClick={submit} disabled={!!opts?.inputRequired && !value.trim()}>
              {opts?.confirmText ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

type Opts = { title: string; description?: string; confirmText?: string; cancelText?: string; tone?: "default" | "danger" };
type Resolver = (v: boolean) => void;

const Ctx = createContext<(o: Opts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<Opts | null>(null);
  const [resolver, setResolver] = useState<Resolver | null>(null);

  const confirm = useCallback((o: Opts) => {
    setOpts(o);
    return new Promise<boolean>((res) => setResolver(() => res));
  }, []);

  const close = (v: boolean) => { resolver?.(v); setResolver(null); setOpts(null); };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onOpenChange={(o) => !o && close(false)}>
        <DialogContent className="glass-strong border-primary/30 max-w-md backdrop-blur-2xl">
          <DialogHeader>
            <div className={`h-12 w-12 rounded-full grid place-items-center mb-2 ${opts?.tone === "danger" ? "bg-destructive/20" : "bg-primary/20"}`}>
              <AlertTriangle className={`h-6 w-6 ${opts?.tone === "danger" ? "text-destructive" : "text-primary"}`} />
            </div>
            <DialogTitle className="text-xl">{opts?.title}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{opts?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => close(false)}>{opts?.cancelText ?? "Cancel"}</Button>
            <Button variant={opts?.tone === "danger" ? "destructive" : "default"} onClick={() => close(true)}>
              {opts?.confirmText ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);

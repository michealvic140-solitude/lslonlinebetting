import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";

export function PopupAd() {
  const [s, setS] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.from("app_settings").select("popup_ad_active,popup_ad_image,popup_ad_text,popup_ad_link,popup_ad_size,updated_at").eq("id", 1).maybeSingle()
      .then(({ data }) => {
        if (!data?.popup_ad_active) return;
        const dismissed = sessionStorage.getItem(`popup-${data.updated_at}`);
        if (dismissed) return;
        setS(data); setOpen(true);
      });
  }, []);

  if (!open || !s) return null;
  const close = () => { sessionStorage.setItem(`popup-${s.updated_at}`, "1"); setOpen(false); };
  const sizeCls = s.popup_ad_size === "xl" ? "max-w-3xl" : s.popup_ad_size === "medium" ? "max-w-md" : "max-w-2xl";
  const imgCls = s.popup_ad_size === "xl" ? "max-h-[70vh]" : s.popup_ad_size === "medium" ? "max-h-80" : "max-h-[60vh]";
  const hasText = !!(s.popup_ad_text && s.popup_ad_text.trim());
  const hasImage = !!s.popup_ad_image;
  const Inner = (
    <div className={`relative ${sizeCls} w-full bg-transparent`}>
      <button onClick={close} className="absolute top-3 right-3 z-10 h-10 w-10 grid place-items-center rounded-full bg-background/80 hover:bg-background border border-border"><X className="h-5 w-5" /></button>
      {hasImage && (
        <img
          src={s.popup_ad_image}
          alt=""
          className={`w-full ${imgCls} object-contain drop-shadow-2xl`}
          style={{ background: "transparent" }}
        />
      )}
      {hasText && (
        <div className="mt-3 p-6 text-base whitespace-pre-wrap rounded-3xl border border-primary/40 bg-card/70 backdrop-blur-2xl shadow-2xl">
          {s.popup_ad_text}
        </div>
      )}
    </div>
  );
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4 bg-background/80 backdrop-blur-md" onClick={close}>
      <div onClick={(e) => e.stopPropagation()}>
        {s.popup_ad_link ? <a href={s.popup_ad_link} target="_blank" rel="noreferrer">{Inner}</a> : Inner}
      </div>
    </div>
  );
}

import { createFileRoute } from '@tanstack/react-router'
import webpush from 'web-push'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { configureWebPush, getAudienceSubscriptions, sendToSubscriptions } from '@/lib/push-send.server'

// Called by pg_cron every 15 minutes. Evaluates all enabled recurring push
// reminders and dispatches those whose slot is due (once per slot).
export const Route = createFileRoute('/api/public/hooks/recurring-push')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { data: rows } = await supabaseAdmin
            .from('recurring_push_settings')
            .select('*')
            .eq('enabled', true)
          if (!rows || rows.length === 0) {
            return json({ processed: 0, checked: 0 })
          }

          const now = new Date()
          const hour = now.getUTCHours()
          const dateStr = now.toISOString().slice(0, 10) // YYYY-MM-DD
          const hourSlot = `${dateStr}-${String(hour).padStart(2, '0')}`

          const configured = await configureWebPush(webpush, supabaseAdmin)
          if (!configured) return json({ error: 'VAPID keys not configured.' }, 500)

          let processed = 0
          for (const row of rows as any[]) {
            const cadence = row.cadence as 'daily' | 'hourly'
            const slot = cadence === 'hourly' ? hourSlot : dateStr

            // Slot gating: only fire once per slot.
            if (row.last_sent_slot === slot) continue

            if (cadence === 'daily') {
              if (typeof row.hour_utc !== 'number' || row.hour_utc !== hour) continue
            } else {
              if (hour < (row.start_hour_utc ?? 8) || hour > (row.end_hour_utc ?? 22)) continue
            }

            // Atomically claim the slot before sending so overlapping cron runs
            // don't double-send.
            const { data: claimed } = await supabaseAdmin
              .from('recurring_push_settings')
              .update({ last_sent_slot: slot } as any)
              .eq('key', row.key)
              .neq('last_sent_slot', slot)
              .select('key')
              .maybeSingle()
            if (!claimed) continue

            // Resolve body: cycle through motivational content if configured.
            let body: string = row.body || ''
            let nextIndex = row.next_index ?? 0
            if (row.cycles_content) {
              const { count } = await supabaseAdmin
                .from('motivational_content')
                .select('id', { count: 'exact', head: true })
                .eq('kind', row.cycles_content)
              const total = count ?? 0
              if (total > 0) {
                const idx = ((row.next_index ?? 0) % total + total) % total
                const { data: entry } = await supabaseAdmin
                  .from('motivational_content')
                  .select('text')
                  .eq('kind', row.cycles_content)
                  .eq('idx', idx)
                  .maybeSingle()
                if (entry?.text) body = entry.text
                nextIndex = (idx + 1) % total
              }
            }

            try {
              const subs = await getAudienceSubscriptions(supabaseAdmin, { role: 'any' })
              const { sent, total } = await sendToSubscriptions(webpush, supabaseAdmin, subs, {
                title: row.title,
                body,
                link: row.link || '/',
                tag: `recurring-${row.key}-${slot}`,
              })
              await supabaseAdmin
                .from('recurring_push_settings')
                .update({
                  last_sent_at: new Date().toISOString(),
                  next_index: nextIndex,
                } as any)
                .eq('key', row.key)
              await supabaseAdmin.from('broadcasts').insert({
                title: row.title,
                body,
                link: row.link || '',
                segment: `recurring-${row.key}`,
                sent_count: sent,
              })
              processed++
              void total
            } catch (e: any) {
              // Release the slot claim so a later run can retry (up to same-hour window).
              await supabaseAdmin
                .from('recurring_push_settings')
                .update({ last_sent_slot: null } as any)
                .eq('key', row.key)
                .eq('last_sent_slot', slot)
            }
          }

          return json({ processed, checked: rows.length, hour, slot: hourSlot })
        } catch (e: any) {
          return json({ error: e?.message || 'error' }, 500)
        }
      },
    },
  },
})

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

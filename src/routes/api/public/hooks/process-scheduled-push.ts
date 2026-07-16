import { createFileRoute } from '@tanstack/react-router'
import webpush from 'web-push'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { getAudienceSubscriptions, configureWebPush, sendToSubscriptions } from '@/lib/push-send.server'

// Called by pg_cron every minute to deliver any scheduled push blasts that are due.
export const Route = createFileRoute('/api/public/hooks/process-scheduled-push')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const nowIso = new Date().toISOString()
          const { data: due } = await supabaseAdmin
            .from('scheduled_pushes')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_for', nowIso)
            .order('scheduled_for', { ascending: true })
            .limit(20)

          if (!due || due.length === 0) {
            return new Response(JSON.stringify({ processed: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
          }

          const configured = await configureWebPush(webpush, supabaseAdmin)
          let processed = 0

          for (const row of due as any[]) {
            // Claim the row so overlapping cron runs don't double-send.
            const { data: claimed } = await supabaseAdmin
              .from('scheduled_pushes')
              .update({ status: 'sending' } as any)
              .eq('id', row.id)
              .eq('status', 'pending')
              .select('id')
              .maybeSingle()
            if (!claimed) continue

            if (!configured) {
              await supabaseAdmin.from('scheduled_pushes').update({ status: 'failed', error: 'VAPID keys not configured.' } as any).eq('id', row.id)
              continue
            }

            try {
              const subs = await getAudienceSubscriptions(supabaseAdmin, {
                role: row.role,
                locale: row.locale,
                lastActiveDays: row.last_active_days,
              })
              const { sent, total } = await sendToSubscriptions(webpush, supabaseAdmin, subs, {
                title: row.title,
                body: row.body,
                link: row.link,
                image: row.image || undefined,
              })
              await supabaseAdmin.from('scheduled_pushes').update({
                status: 'sent',
                sent_count: sent,
                total_count: total,
                sent_at: new Date().toISOString(),
              } as any).eq('id', row.id)
              await supabaseAdmin.from('broadcasts').insert({
                title: row.title,
                body: row.body || '',
                link: row.link || '',
                segment: 'push-scheduled',
                sent_count: sent,
                created_by: row.created_by,
              })
              processed++
            } catch (e: any) {
              await supabaseAdmin.from('scheduled_pushes').update({ status: 'failed', error: e?.message || 'send failed' } as any).eq('id', row.id)
            }
          }

          return new Response(JSON.stringify({ processed }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500 })
        }
      },
    },
  },
})

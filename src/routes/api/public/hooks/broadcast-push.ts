import { createFileRoute } from '@tanstack/react-router'
import webpush from 'web-push'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { getAudienceSubscriptions, configureWebPush, sendToSubscriptions } from '@/lib/push-send.server'

// Called by DB triggers (net.http_post) to blast a global device push to all
// subscribers when a real match goes live / is posted, or an announcement drops.
// It verifies the referenced row against the DB, so no shared secret is needed:
// the payload can only reference real, active records.
export const Route = createFileRoute('/api/public/hooks/broadcast-push')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { kind, id } = (await request.json()) as { kind?: string; id?: string }
          if (!kind || !id) return new Response('bad', { status: 400 })

          let content: { title: string; body: string; link: string } | null = null

          if (kind === 'match_live' || kind === 'match_upcoming') {
            const { data: m } = await supabaseAdmin
              .from('matches')
              .select('id,name,status,is_virtual')
              .eq('id', id)
              .maybeSingle()
            if (!m || (m as any).is_virtual) return new Response('skip', { status: 200 })
            const name = (m as any).name || 'Match'
            if (kind === 'match_live' && (m as any).status === 'live') {
              content = { title: `🔴 LIVE now: ${name}`, body: 'Watch the action and place your bets before it locks!', link: `/matches/${id}` }
            } else if (kind === 'match_upcoming' && (m as any).status === 'scheduled') {
              content = { title: `🎯 New match posted: ${name}`, body: 'Book and predict now to get the best odds!', link: `/matches/${id}` }
            }
          } else if (kind === 'announcement') {
            const { data: a } = await supabaseAdmin
              .from('announcements')
              .select('id,title,body,is_active')
              .eq('id', id)
              .maybeSingle()
            if (!a || !(a as any).is_active) return new Response('skip', { status: 200 })
            content = { title: `📢 ${(a as any).title || 'Announcement'}`, body: (a as any).body || '', link: '/' }
          }

          if (!content) return new Response('skip', { status: 200 })

          const configured = await configureWebPush(webpush, supabaseAdmin)
          if (!configured) return new Response(JSON.stringify({ skipped: 'no_vapid_keys' }), { status: 200 })

          const subs = await getAudienceSubscriptions(supabaseAdmin, {})
          const { sent, total } = await sendToSubscriptions(webpush, supabaseAdmin, subs, {
            title: content.title,
            body: content.body,
            link: content.link,
            tag: `${kind}-${id}`,
          })
          return new Response(JSON.stringify({ sent, total }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500 })
        }
      },
    },
  },
})
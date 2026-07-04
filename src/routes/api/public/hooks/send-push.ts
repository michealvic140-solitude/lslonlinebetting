import { createFileRoute } from '@tanstack/react-router'
import webpush from 'web-push'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

export const Route = createFileRoute('/api/public/hooks/send-push')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { user_id?: string; title?: string; body?: string; link?: string; notification_id?: string }
          const secret = request.headers.get('x-push-secret')
          let msg = { user_id: body.user_id, title: body.title, body: body.body || '', link: body.link || '/', notification_id: body.notification_id }

          if (body.notification_id && (!body.user_id || !body.title)) {
            const { data: n } = await supabaseAdmin.from('notifications').select('id,user_id,title,body,link').eq('id', body.notification_id).maybeSingle()
            if (!n) return new Response('notification_not_found', { status: 404 })
            msg = { user_id: (n as any).user_id, title: (n as any).title, body: (n as any).body || '', link: (n as any).link || '/', notification_id: (n as any).id }
          } else if (!secret || !process.env.PUSH_WEBHOOK_SECRET || secret !== process.env.PUSH_WEBHOOK_SECRET) {
            return new Response('Forbidden', { status: 403 })
          }

          if (!msg.user_id || !msg.title) return new Response('bad', { status: 400 })

          const { data: settings } = await supabaseAdmin.from('app_settings').select('vapid_public_key').eq('id', 1).maybeSingle()
          const { data: privSettings } = await supabaseAdmin.from('app_settings_private').select('vapid_subject').eq('id', 1).maybeSingle()
          const pub = (settings as any)?.vapid_public_key || process.env.VAPID_PUBLIC_KEY
          const priv = process.env.VAPID_PRIVATE_KEY
          const subject = (privSettings as any)?.vapid_subject || 'mailto:admin@example.com'
          if (!pub || !priv) return new Response(JSON.stringify({ skipped: 'no_vapid_keys' }), { status: 200 })
          webpush.setVapidDetails(subject, pub, priv)

          const { data: prefs } = await supabaseAdmin.from('notification_prefs').select('*').eq('user_id', msg.user_id).maybeSingle()
          if (prefs && (prefs as any).push_enabled === false) return new Response(JSON.stringify({ skipped: 'pref_off' }), { status: 200 })

          const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('*').eq('user_id', msg.user_id).eq('enabled', true)
          const payload = JSON.stringify({ title: msg.title, body: msg.body || '', link: msg.link || '/', notification_id: msg.notification_id })
          let sent = 0; const dead: string[] = []
          for (const s of subs ?? []) {
            const sub: any = s
            if (!sub.endpoint?.startsWith('http')) continue
            try {
              await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } } as any, payload)
              sent++
            } catch (err: any) {
              if (err?.statusCode === 410 || err?.statusCode === 404) dead.push(sub.id)
            }
          }
          if (dead.length) await supabaseAdmin.from('push_subscriptions').update({ enabled: false, disabled_at: new Date().toISOString() } as any).in('id', dead)
          if (msg.notification_id) {
            await supabaseAdmin.from('push_delivery_log').upsert({ notification_id: msg.notification_id, sent_count: sent, removed_count: dead.length, delivered_at: new Date().toISOString() } as any)
          }
          return new Response(JSON.stringify({ sent, removed: dead.length }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500 })
        }
      },
    },
  },
})
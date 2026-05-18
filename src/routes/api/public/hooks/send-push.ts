import { createFileRoute } from '@tanstack/react-router'
import webpush from 'web-push'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

export const Route = createFileRoute('/api/public/hooks/send-push')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const secret = request.headers.get('x-push-secret')
          if (!secret || !process.env.PUSH_WEBHOOK_SECRET || secret !== process.env.PUSH_WEBHOOK_SECRET) {
            return new Response('Forbidden', { status: 403 })
          }
          const body = (await request.json()) as { user_id?: string; title?: string; body?: string; link?: string; notification_id?: string }
          if (!body?.user_id || !body?.title) return new Response('bad', { status: 400 })

          const { data: settings } = await supabaseAdmin.from('app_settings').select('vapid_public_key, vapid_subject').eq('id', 1).maybeSingle()
          const pub = (settings as any)?.vapid_public_key || process.env.VAPID_PUBLIC_KEY
          const priv = process.env.VAPID_PRIVATE_KEY
          const subject = (settings as any)?.vapid_subject || 'mailto:admin@example.com'
          if (!pub || !priv) return new Response(JSON.stringify({ skipped: 'no_vapid_keys' }), { status: 200 })
          webpush.setVapidDetails(subject, pub, priv)

          const { data: prefs } = await supabaseAdmin.from('notification_prefs').select('*').eq('user_id', body.user_id).maybeSingle()
          if (prefs && (prefs as any).push_enabled === false) return new Response(JSON.stringify({ skipped: 'pref_off' }), { status: 200 })

          const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('*').eq('user_id', body.user_id).eq('enabled', true)
          const payload = JSON.stringify({ title: body.title, body: body.body || '', link: body.link || '/', notification_id: body.notification_id })
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
          if (dead.length) await supabaseAdmin.from('push_subscriptions').delete().in('id', dead)
          return new Response(JSON.stringify({ sent, removed: dead.length }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500 })
        }
      },
    },
  },
})
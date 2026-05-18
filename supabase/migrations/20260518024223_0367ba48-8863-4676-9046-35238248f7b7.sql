create policy "admins write public asset buckets"
on storage.objects for insert to authenticated
with check (
  bucket_id = any (array['ads','announcements','highlights','team-logos','player-avatars','gang-emblems','event-banners','season-banners','popup-ads','chat-images']::text[])
  and is_mod_or_admin(auth.uid())
);

create policy "admins update public asset buckets"
on storage.objects for update to authenticated
using (
  bucket_id = any (array['ads','announcements','highlights','team-logos','player-avatars','gang-emblems','event-banners','season-banners','popup-ads','chat-images']::text[])
  and is_mod_or_admin(auth.uid())
)
with check (
  bucket_id = any (array['ads','announcements','highlights','team-logos','player-avatars','gang-emblems','event-banners','season-banners','popup-ads','chat-images']::text[])
  and is_mod_or_admin(auth.uid())
);

create policy "admins delete public asset buckets"
on storage.objects for delete to authenticated
using (
  bucket_id = any (array['ads','announcements','highlights','team-logos','player-avatars','gang-emblems','event-banners','season-banners','popup-ads','chat-images']::text[])
  and is_mod_or_admin(auth.uid())
);
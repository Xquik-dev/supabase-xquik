set local lock_timeout = '5s';
set local statement_timeout = '60s';

revoke all on table public.xquik_actions, public.xquik_events, public.xquik_webhook_nonces from anon, authenticated;
revoke all on sequence public.xquik_actions_id_seq from anon, authenticated;

create policy "anon reads no operations" on xquik.operations
for select to anon using (false);
create policy "anon adds no operations" on xquik.operations
for insert to anon with check (false);
create policy "anon changes no operations" on xquik.operations
for update to anon using (false) with check (false);
create policy "anon removes no operations" on xquik.operations
for delete to anon using (false);

create policy "authenticated reads no operations" on xquik.operations
for select to authenticated using (false);
create policy "authenticated adds no operations" on xquik.operations
for insert to authenticated with check (false);
create policy "authenticated changes no operations" on xquik.operations
for update to authenticated using (false) with check (false);
create policy "authenticated removes no operations" on xquik.operations
for delete to authenticated using (false);

create policy "anon reads no actions" on public.xquik_actions
for select to anon using (false);
create policy "anon adds no actions" on public.xquik_actions
for insert to anon with check (false);
create policy "anon changes no actions" on public.xquik_actions
for update to anon using (false) with check (false);
create policy "anon removes no actions" on public.xquik_actions
for delete to anon using (false);

create policy "authenticated reads no actions" on public.xquik_actions
for select to authenticated using (false);
create policy "authenticated adds no actions" on public.xquik_actions
for insert to authenticated with check (false);
create policy "authenticated changes no actions" on public.xquik_actions
for update to authenticated using (false) with check (false);
create policy "authenticated removes no actions" on public.xquik_actions
for delete to authenticated using (false);

create policy "anon reads no events" on public.xquik_events
for select to anon using (false);
create policy "anon adds no events" on public.xquik_events
for insert to anon with check (false);
create policy "anon changes no events" on public.xquik_events
for update to anon using (false) with check (false);
create policy "anon removes no events" on public.xquik_events
for delete to anon using (false);

create policy "authenticated reads no events" on public.xquik_events
for select to authenticated using (false);
create policy "authenticated adds no events" on public.xquik_events
for insert to authenticated with check (false);
create policy "authenticated changes no events" on public.xquik_events
for update to authenticated using (false) with check (false);
create policy "authenticated removes no events" on public.xquik_events
for delete to authenticated using (false);

create policy "anon reads no nonces" on public.xquik_webhook_nonces
for select to anon using (false);
create policy "anon adds no nonces" on public.xquik_webhook_nonces
for insert to anon with check (false);
create policy "anon changes no nonces" on public.xquik_webhook_nonces
for update to anon using (false) with check (false);
create policy "anon removes no nonces" on public.xquik_webhook_nonces
for delete to anon using (false);

create policy "authenticated reads no nonces" on public.xquik_webhook_nonces
for select to authenticated using (false);
create policy "authenticated adds no nonces" on public.xquik_webhook_nonces
for insert to authenticated with check (false);
create policy "authenticated changes no nonces" on public.xquik_webhook_nonces
for update to authenticated using (false) with check (false);
create policy "authenticated removes no nonces" on public.xquik_webhook_nonces
for delete to authenticated using (false);

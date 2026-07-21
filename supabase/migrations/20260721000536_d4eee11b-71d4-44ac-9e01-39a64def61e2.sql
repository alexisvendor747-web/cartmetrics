DROP POLICY IF EXISTS "read all" ON public.app_settings;
CREATE POLICY "read non-secret settings" ON public.app_settings FOR SELECT TO authenticated USING (key <> 'admin_passkey_sha256');
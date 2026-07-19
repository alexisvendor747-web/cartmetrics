
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin')) $$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO postgres, service_role;

-- public policies
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT
  USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "read own or admin" ON public.profiles;
CREATE POLICY "read own or admin" ON public.profiles FOR SELECT
  USING ((auth.uid() = id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "own chats" ON public.chats;
CREATE POLICY "own chats" ON public.chats FOR ALL
  USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own messages" ON public.messages;
CREATE POLICY "own messages" ON public.messages FOR ALL
  USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own txn" ON public.credit_transactions;
CREATE POLICY "own txn" ON public.credit_transactions FOR SELECT
  USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "own pay read" ON public.payment_requests;
CREATE POLICY "own pay read" ON public.payment_requests FOR SELECT
  USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "read active packages" ON public.credit_packages;
CREATE POLICY "read active packages" ON public.credit_packages FOR SELECT
  USING (active OR private.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admin manage packages" ON public.credit_packages;
CREATE POLICY "admin manage packages" ON public.credit_packages FOR ALL
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "read active announcements" ON public.announcements;
CREATE POLICY "read active announcements" ON public.announcements FOR SELECT
  USING (active OR private.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admin manage announcements" ON public.announcements;
CREATE POLICY "admin manage announcements" ON public.announcements FOR ALL
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "read published faqs" ON public.faqs;
CREATE POLICY "read published faqs" ON public.faqs FOR SELECT
  USING (published OR private.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admin manage faqs" ON public.faqs;
CREATE POLICY "admin manage faqs" ON public.faqs FOR ALL
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin manage flags" ON public.feature_flags;
CREATE POLICY "admin manage flags" ON public.feature_flags FOR ALL
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "own or admin read tickets" ON public.support_tickets;
CREATE POLICY "own or admin read tickets" ON public.support_tickets FOR SELECT
  USING ((user_id = auth.uid()) OR private.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admin update ticket" ON public.support_tickets;
CREATE POLICY "admin update ticket" ON public.support_tickets FOR UPDATE
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "read ticket messages" ON public.support_ticket_messages;
CREATE POLICY "read ticket messages" ON public.support_ticket_messages FOR SELECT
  USING (private.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id AND t.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS "post ticket messages" ON public.support_ticket_messages;
CREATE POLICY "post ticket messages" ON public.support_ticket_messages FOR INSERT
  WITH CHECK ((author_id = auth.uid()) AND (private.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id AND t.user_id = auth.uid()
  )));

DROP POLICY IF EXISTS "admin read broadcasts" ON public.broadcast_emails;
CREATE POLICY "admin read broadcasts" ON public.broadcast_emails FOR SELECT
  USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin read audit" ON public.admin_audit_log;
CREATE POLICY "admin read audit" ON public.admin_audit_log FOR SELECT
  USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "read published posts" ON public.blog_posts;
CREATE POLICY "read published posts" ON public.blog_posts FOR SELECT
  USING (published OR private.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admin manage posts" ON public.blog_posts;
CREATE POLICY "admin manage posts" ON public.blog_posts FOR ALL
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

-- storage policy referencing the old helper
DROP POLICY IF EXISTS "pay read own" ON storage.objects;
CREATE POLICY "pay read own" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR private.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

-- drop the API-exposed SECURITY DEFINER helpers
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_admin(uuid);

-- SECURITY INVOKER wrappers so server code can still call rpc('has_role') / rpc('is_admin')
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin')) $$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

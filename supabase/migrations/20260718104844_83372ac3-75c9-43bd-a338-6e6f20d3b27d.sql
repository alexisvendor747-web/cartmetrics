
-- 2. Profile status
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended'));

-- 3. Helper: is_admin (either admin or super_admin)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin'))
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

-- 4. Seed super_admin for the founder email (if account already exists)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role FROM auth.users WHERE lower(email) = 'apraisesamuel@gmail.com'
ON CONFLICT DO NOTHING;

-- 5. Update handle_new_user trigger to auto-grant super_admin when founder signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  IF lower(NEW.email) = 'apraisesamuel@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

-- 6. Seed core app_settings (passkey hash, maintenance, pricing)
INSERT INTO public.app_settings (key, value) VALUES
  ('admin_passkey_sha256', to_jsonb('68bc5e7ac3fb063e8e1851d5eff70d47e077551bbe6e44ce88dff3886966cc12'::text)),
  ('maintenance_mode', jsonb_build_object('enabled', false, 'message', 'We''re performing scheduled maintenance. Back shortly.')),
  ('pricing', jsonb_build_object('currency','USD','credit_rate', 0.01)),
  ('branding', jsonb_build_object('site_name','CartMetrics AI','tagline','The all-in-one AI workspace'))
ON CONFLICT (key) DO NOTHING;

-- Ensure enabled_models default exists
INSERT INTO public.app_settings (key, value) VALUES
  ('enabled_models', jsonb_build_array(
    jsonb_build_object('id','google/gemini-2.5-flash','label','Gemini 2.5 Flash','cost',1,'enabled',true),
    jsonb_build_object('id','google/gemini-2.5-pro','label','Gemini 2.5 Pro','cost',5,'enabled',true),
    jsonb_build_object('id','openai/gpt-5','label','GPT-5','cost',8,'enabled',true),
    jsonb_build_object('id','openai/gpt-5-mini','label','GPT-5 Mini','cost',2,'enabled',true)
  ))
ON CONFLICT (key) DO NOTHING;

-- 7. Announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','critical')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.announcements TO authenticated, anon;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read active announcements" ON public.announcements FOR SELECT USING (active OR public.is_admin(auth.uid()));
CREATE POLICY "admin manage announcements" ON public.announcements FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 8. FAQs
CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  sort_order int NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.faqs TO authenticated, anon;
GRANT ALL ON public.faqs TO service_role;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read published faqs" ON public.faqs FOR SELECT USING (published OR public.is_admin(auth.uid()));
CREATE POLICY "admin manage faqs" ON public.faqs FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 9. Feature flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feature_flags TO authenticated, anon;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read flags" ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY "admin manage flags" ON public.feature_flags FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('chat',true,'Core chat feature'),
  ('image_generator',true,'Image generation tool'),
  ('deep_research',true,'Deep research tool'),
  ('website_audit',true,'Website audit tool'),
  ('seo_audit',true,'SEO audit tool'),
  ('background_removal',true,'Background removal'),
  ('voice_ai',true,'Voice AI tools'),
  ('signup',true,'Allow new signups')
ON CONFLICT (key) DO NOTHING;

-- 10. Credit packages
CREATE TABLE IF NOT EXISTS public.credit_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  credits int NOT NULL CHECK (credits > 0),
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'USD',
  bonus_credits int NOT NULL DEFAULT 0,
  featured boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_packages TO authenticated, anon;
GRANT ALL ON public.credit_packages TO service_role;
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read active packages" ON public.credit_packages FOR SELECT USING (active OR public.is_admin(auth.uid()));
CREATE POLICY "admin manage packages" ON public.credit_packages FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.credit_packages (name, credits, price, bonus_credits, featured, sort_order, description) VALUES
  ('Starter', 500, 5.00, 0, false, 1, 'Perfect for trying things out'),
  ('Creator', 2500, 20.00, 250, true, 2, 'Most popular — best value for regular users'),
  ('Pro', 10000, 75.00, 1500, false, 3, 'For power users and small teams'),
  ('Business', 50000, 300.00, 10000, false, 4, 'For agencies and heavy workloads');

-- 11. Support tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or admin read tickets" ON public.support_tickets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "user create ticket" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "admin update ticket" ON public.support_tickets FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_staff boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read ticket messages" ON public.support_ticket_messages FOR SELECT TO authenticated USING (
  public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
);
CREATE POLICY "post ticket messages" ON public.support_ticket_messages FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid() AND (
    public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  )
);

-- 12. Broadcast emails
CREATE TABLE IF NOT EXISTS public.broadcast_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  body_html text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','active','suspended','custom')),
  sent_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','sent','failed')),
  sent_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.broadcast_emails TO service_role;
GRANT SELECT ON public.broadcast_emails TO authenticated;
ALTER TABLE public.broadcast_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read broadcasts" ON public.broadcast_emails FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 13. Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read audit" ON public.admin_audit_log FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 14. Blog posts
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text,
  body_md text NOT NULL,
  cover_url text,
  author_id uuid REFERENCES auth.users(id),
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_posts TO authenticated, anon;
GRANT ALL ON public.blog_posts TO service_role;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read published posts" ON public.blog_posts FOR SELECT USING (published OR public.is_admin(auth.uid()));
CREATE POLICY "admin manage posts" ON public.blog_posts FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 15. touch updated_at triggers
DROP TRIGGER IF EXISTS t_ann_touch ON public.announcements;
CREATE TRIGGER t_ann_touch BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS t_faq_touch ON public.faqs;
CREATE TRIGGER t_faq_touch BEFORE UPDATE ON public.faqs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS t_pkg_touch ON public.credit_packages;
CREATE TRIGGER t_pkg_touch BEFORE UPDATE ON public.credit_packages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS t_ticket_touch ON public.support_tickets;
CREATE TRIGGER t_ticket_touch BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS t_blog_touch ON public.blog_posts;
CREATE TRIGGER t_blog_touch BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 16. Seed welcome content
INSERT INTO public.announcements (title, body, severity) VALUES
  ('Welcome to CartMetrics AI', 'Explore our full workspace of AI tools. Upload files, generate images, run deep research, and more.', 'info');

INSERT INTO public.faqs (question, answer, category, sort_order) VALUES
  ('How do credits work?', 'Each AI model has a per-message credit cost. Credits are deducted automatically as you use the platform.', 'billing', 1),
  ('How do I buy credits?', 'Go to Credits → Buy Credits, choose a package, and submit a manual payment. Your credits are added once approved.', 'billing', 2),
  ('Can I export my chats?', 'Yes — visit Settings → Export Data to download all of your data.', 'account', 3);

-- 17. Suspend policy: extend chats/messages to block suspended users at write time via trigger
CREATE OR REPLACE FUNCTION public.block_suspended()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND status = 'suspended') THEN
    RAISE EXCEPTION 'account_suspended';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS t_block_chat ON public.chats;
CREATE TRIGGER t_block_chat BEFORE INSERT OR UPDATE ON public.chats FOR EACH ROW EXECUTE FUNCTION public.block_suspended();
DROP TRIGGER IF EXISTS t_block_msg ON public.messages;
CREATE TRIGGER t_block_msg BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.block_suspended();

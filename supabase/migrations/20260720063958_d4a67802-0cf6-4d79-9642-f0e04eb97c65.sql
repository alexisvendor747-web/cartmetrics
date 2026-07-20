
-- credit_transactions: explicit admin-only write policies (regular inserts happen via SECURITY DEFINER adjust_credits)
CREATE POLICY "admins insert credit txns" ON public.credit_transactions
  FOR INSERT TO authenticated WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins update credit txns" ON public.credit_transactions
  FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins delete credit txns" ON public.credit_transactions
  FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

-- payment_requests: admin update + delete for review workflow
CREATE POLICY "admins update payments" ON public.payment_requests
  FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins delete payments" ON public.payment_requests
  FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

-- user_roles: admin-only writes to prevent privilege escalation
CREATE POLICY "admins insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

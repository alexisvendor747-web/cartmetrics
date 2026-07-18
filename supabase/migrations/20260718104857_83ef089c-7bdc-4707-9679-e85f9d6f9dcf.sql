
REVOKE EXECUTE ON FUNCTION public.block_suspended() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.adjust_credits(uuid, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_credits(uuid, integer, text, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;

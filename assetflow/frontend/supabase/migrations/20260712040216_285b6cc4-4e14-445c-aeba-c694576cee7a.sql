-- Asset categories with custom field schema
CREATE TABLE public.asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_categories TO authenticated;
GRANT ALL ON public.asset_categories TO service_role;
ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories readable by authenticated" ON public.asset_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/managers manage categories" ON public.asset_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'));
CREATE TRIGGER trg_asset_categories_updated BEFORE UPDATE ON public.asset_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Asset status enum
CREATE TYPE public.asset_status AS ENUM ('available','allocated','reserved','maintenance','lost','retired');
CREATE TYPE public.asset_condition AS ENUM ('new','good','fair','poor');

-- Assets
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.asset_categories(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  status public.asset_status NOT NULL DEFAULT 'available',
  condition public.asset_condition NOT NULL DEFAULT 'good',
  serial_number TEXT,
  manufacturer TEXT,
  model TEXT,
  purchase_date DATE,
  purchase_cost NUMERIC(12,2),
  warranty_expiry DATE,
  location TEXT,
  description TEXT,
  custom_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_url TEXT,
  is_bookable BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assets readable by authenticated" ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/managers insert assets" ON public.assets FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'));
CREATE POLICY "Admins/managers update assets" ON public.assets FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'));
CREATE POLICY "Admins delete assets" ON public.assets FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_assets_updated BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_assets_status ON public.assets(status);
CREATE INDEX idx_assets_category ON public.assets(category_id);
CREATE INDEX idx_assets_department ON public.assets(department_id);

-- Allocations
CREATE TYPE public.allocation_status AS ENUM ('active','returned','overdue');
CREATE TABLE public.allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  assignee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allocated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_return DATE,
  returned_at TIMESTAMPTZ,
  status public.allocation_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocations TO authenticated;
GRANT ALL ON public.allocations TO service_role;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own or managed allocations" ON public.allocations FOR SELECT TO authenticated
  USING (assignee_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager') OR has_role(auth.uid(),'dept_head'));
CREATE POLICY "Managers manage allocations" ON public.allocations FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'));
CREATE TRIGGER trg_allocations_updated BEFORE UPDATE ON public.allocations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_allocations_assignee ON public.allocations(assignee_id);
CREATE INDEX idx_allocations_asset ON public.allocations(asset_id);
CREATE INDEX idx_allocations_status ON public.allocations(status);

-- Transfer requests
CREATE TYPE public.transfer_status AS ENUM ('pending','approved','rejected','completed');
CREATE TABLE public.transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  status public.transfer_status NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_requests TO authenticated;
GRANT ALL ON public.transfer_requests TO service_role;
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own transfers" ON public.transfer_requests FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid() OR requested_by = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager') OR has_role(auth.uid(),'dept_head'));
CREATE POLICY "Users create own transfer requests" ON public.transfer_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());
CREATE POLICY "Managers/dept heads decide transfers" ON public.transfer_requests FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager') OR has_role(auth.uid(),'dept_head'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager') OR has_role(auth.uid(),'dept_head'));
CREATE TRIGGER trg_transfer_requests_updated BEFORE UPDATE ON public.transfer_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Bookings (resource reservations)
CREATE TYPE public.booking_status AS ENUM ('pending','confirmed','cancelled','completed');
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  purpose TEXT,
  status public.booking_status NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bookings readable by authenticated" ON public.bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create own bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own bookings or managers" ON public.bookings FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'));
CREATE POLICY "Users delete own bookings or managers" ON public.bookings FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'));
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_bookings_asset_time ON public.bookings(asset_id, start_at, end_at);

-- Maintenance requests
CREATE TYPE public.maintenance_status AS ENUM ('reported','approved','in_progress','completed','rejected');
CREATE TYPE public.maintenance_priority AS ENUM ('low','medium','high','critical');
CREATE TABLE public.maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  issue TEXT NOT NULL,
  priority public.maintenance_priority NOT NULL DEFAULT 'medium',
  status public.maintenance_status NOT NULL DEFAULT 'reported',
  resolution TEXT,
  cost NUMERIC(12,2),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_requests TO authenticated;
GRANT ALL ON public.maintenance_requests TO service_role;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Maintenance readable by authenticated" ON public.maintenance_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create maintenance requests" ON public.maintenance_requests FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid());
CREATE POLICY "Managers/assignees update maintenance" ON public.maintenance_requests FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'))
  WITH CHECK (assigned_to = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'));
CREATE TRIGGER trg_maintenance_updated BEFORE UPDATE ON public.maintenance_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit cycles
CREATE TYPE public.audit_cycle_status AS ENUM ('draft','in_progress','completed','cancelled');
CREATE TYPE public.audit_item_result AS ENUM ('pending','verified','missing','damaged','misplaced');
CREATE TABLE public.audit_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  scope_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  scope_category_id UUID REFERENCES public.asset_categories(id) ON DELETE SET NULL,
  status public.audit_cycle_status NOT NULL DEFAULT 'draft',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_cycles TO authenticated;
GRANT ALL ON public.audit_cycles TO service_role;
ALTER TABLE public.audit_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audit cycles readable by authenticated" ON public.audit_cycles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/managers manage audit cycles" ON public.audit_cycles FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'));
CREATE TRIGGER trg_audit_cycles_updated BEFORE UPDATE ON public.audit_cycles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.audit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.audit_cycles(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  result public.audit_item_result NOT NULL DEFAULT 'pending',
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cycle_id, asset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_items TO authenticated;
GRANT ALL ON public.audit_items TO service_role;
ALTER TABLE public.audit_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audit items readable by authenticated" ON public.audit_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/managers manage audit items" ON public.audit_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'));
CREATE TRIGGER trg_audit_items_updated BEFORE UPDATE ON public.audit_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service inserts notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager'));
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read_at);

-- Activity log
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Activity readable by admins/managers" ON public.activity_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'asset_manager') OR actor_id = auth.uid());
CREATE POLICY "Users insert own activity" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());
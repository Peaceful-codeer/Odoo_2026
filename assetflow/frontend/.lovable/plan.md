# AssetFlow Build Plan

This is a substantial multi-screen app (14 screens, 4 roles, auth, backend). I'll build it in phases so you can review as we go, rather than dumping everything in one turn.

## Phase 0 — Design direction (next step)
Before writing any UI, I'll generate 3 rendered design directions for the AssetFlow shell (sidebar + dashboard + one data table screen), locked to a clean SaaS aesthetic (Linear/Notion feel, indigo accent, Inter). You pick one and I match composition + tokens exactly across every subsequent screen.

## Phase 1 — Foundation
- Enable Lovable Cloud (auth, Postgres, storage)
- Design system in `src/styles.css`: indigo primary, semantic status colors (available/allocated/reserved/maintenance/lost/retired), status pill + card variants
- App shell: collapsible sidebar (role-filtered), top header with search + notification bell + profile, responsive (bottom tab bar on mobile)
- Landing page, Login, Signup (Employee-only with the reinforced note), Forgot/Reset Password

## Phase 2 — Data model & roles
- Tables: `profiles`, `user_roles` (enum: admin, asset_manager, dept_head, employee) with `has_role()` security definer, `departments`, `asset_categories` (+ custom fields JSONB), `assets`, `allocations`, `transfer_requests`, `bookings`, `maintenance_requests`, `audit_cycles`, `audit_items`, `notifications`, `activity_log`
- RLS + GRANTs per table, department-scoped policies
- Auto-create profile + default Employee role on signup trigger

## Phase 3 — Core screens
- Dashboard (role-variant KPIs, overdue/upcoming, quick actions, recent activity)
- Organization Setup (Departments / Categories / Employee Directory tabs, role assignment with confirmation)
- Asset Directory + multi-section Register modal + Asset Detail (Overview / Allocation / Maintenance / Documents tabs, lifecycle stepper)

## Phase 4 — Workflow screens
- Allocations & Transfers (conflict detection → transfer request queue, return flow, overdue accent)
- Resource Booking (resource list + timeline calendar, overlap validation, My Bookings)
- Maintenance (Kanban + table toggle, approval flow, technician assignment)

## Phase 5 — Governance & insight
- Audit Cycles (create, checklist execution, discrepancy report, close-cycle confirmation)
- Reports & Analytics (5 widgets, filters, CSV export)
- Activity Log + Notifications (bell dropdown + full page, tabs)
- Profile & Settings

## Phase 6 — Polish
- Empty/loading/error states across every list
- Toasts, mobile FAB, skeleton loaders
- SEO metadata per route, sitemap.xml, robots.txt

## Technical notes
- TanStack Start file-based routes under `src/routes/`, `_authenticated` layout for gated screens
- Lovable Cloud (Supabase) for auth + DB + storage; server functions with `requireSupabaseAuth` for writes; RLS enforces role/department scoping
- TanStack Query for all reads via loader + `useSuspenseQuery`
- Realtime subscriptions on `notifications` and `allocations` for live dashboard updates

## What I need from you now
1. Approve this phased approach (or tell me to compress/expand)
2. After approval, I'll generate the 3 design directions — you pick one, then I build Phase 1

Reply "go" to start with design directions, or edit any phase.
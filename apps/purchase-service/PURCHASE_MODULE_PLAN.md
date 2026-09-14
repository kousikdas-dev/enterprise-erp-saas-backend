# Purchase Module Development Plan & Living Documentation

Status: **Supplier V1 and Purchase Order V1 implemented (backend, gateway, Angular) — pending manual browser verification and user review. A UOM/Inventory conversion gap was identified in the Goods Receipt flow (shared with Sales' Shipment flow). See Section 17: the target architecture is now DIRECTIONALLY APPROVED, but implementation of that fix is NOT YET APPROVED — no Goods Receipt/schema/migration code has been written. See Section 18: Purchase Order V1 was extended into a full Sales-Order-like business document on 2026-09-14 — PO Number, Supplier Reference, Expected Delivery Date, Buyer/Purchaser (Identity user reference), an independently-overridable Payment Terms, and Receiving Warehouse (informational only) are now implemented end-to-end (schema/migration, purchase-service, API Gateway, Angular); currency remains explicitly deferred, unchanged. See Section 19: Goods Receipt V1 (full implementation plan, builds on Section 17) is PLANNING ONLY, not implemented, requiring its own explicit go-ahead — this Section 18 extension deliberately left Goods Receipt untouched and confirmed no conflict with its existing compatibility contract. **Corrected 2026-09-14: Sales Invoice and Sales Payment are ALREADY COMPLETED and validated in `apps/sales-service`** — Sections 20–21 document that completed functionality as reference only (not future work; an earlier version of this document incorrectly described them as future implementation phases — see Change History). Section 22 was expanded 2026-09-14 from a brief roadmap into a detailed, implementation-ready future architecture plan for PHASE A (Purchase Invoice V1), PHASE B (Supplier Payment V1), and PHASE C (Accounts Payable/Accounting Integration) — Purchase Invoice, Accounts Payable, and Supplier Payment remain entirely UNIMPLEMENTED; this expansion is documentation/planning only and authorizes no code, schema, or migration work. The Sales alternate-UOM→Inventory conversion gap (Section 17.7) remains a separate, unscheduled future Sales-side fix, distinct from the current Purchase Goods Receipt work. Currency/multi-currency remains deferred everywhere. Accounting Integration remains roadmap-only, gated behind its own separate architecture review (Section 22.12).**
Last updated: 2026-09-14

This file is the persistent source of truth for the Purchase module's architecture and development history. It must be kept up to date by every future contributor/session that modifies this module. See "Change History" at the bottom for chronological updates, and "Architectural Rules / Do Not Break" for constraints that must never be silently violated.

---

## 1. Purchase Module — Current Architecture / Baseline (as of 2026-09-14)

### 1.1 Schema (`apps/purchase-service/prisma/schema.prisma`)
- `Supplier { id, tenantId, code, name, address?, isActive, createdAt, updatedAt }`
  - `@@unique([tenantId, code])`, `@@index([tenantId])`, mapped to `suppliers`.
  - One relation: `PurchaseOrder.supplierId` — real in-DB FK (`onDelete: Restrict`).
- `PurchaseOrder { id, tenantId, supplierId, status, notes, orderDate, createdAt, updatedAt }` — status enum `DRAFT|CONFIRMED|PARTIALLY_RECEIVED|RECEIVED|CANCELLED`. Only stores `supplierId` — no supplier snapshot, no UOM/tax/discount/totals.
- `PurchaseOrderItem { id, tenantId, purchaseOrderId, productId, quantity, unitCost, receivedQuantity, ... }`.
- `GoodsReceipt { id, tenantId, purchaseOrderId, warehouseId, status, receivedAt, ... }` — status enum `PENDING_STOCK|POSTED`. `warehouseId` is our destination/receiving warehouse (inventory-service owns Warehouse; soft UUID reference).
- `GoodsReceiptItem { id, tenantId, goodsReceiptId, purchaseOrderItemId, quantity, ... }`.
- Single migration to date: `20260819120000_purchase_domain_v1` (created the whole purchase domain schema). No Supplier-specific migrations since.

### 1.2 Supplier DTOs (`apps/purchase-service/src/suppliers/dto/supplier.dto.ts`)
- `CreateSupplierDto { code (IsString, IsNotEmpty, MaxLength 32), name (IsString, IsNotEmpty, MaxLength 160), address? (IsOptional, IsString, MaxLength 255) }`
- `UpdateSupplierDto` — same fields, all optional, plus `isActive? (IsOptional, IsBoolean)`.
- No query/filter/pagination DTO exists.

### 1.3 Supplier service/controller/module (`apps/purchase-service/src/suppliers/`)
- `suppliers.service.ts`: manual tenant scoping (`where: { tenantId }` on every query); private `require(actor, id)` helper does `findFirst({ id, tenantId })` → `NotFoundException` if absent (this is how cross-tenant access becomes a 404, not a 403); `create()` normalizes `code.trim().toUpperCase()`, `name.trim()`, `address` trimmed-or-null; Prisma `P2002` → `ConflictException('Supplier code already exists in this tenant')`; `update()` builds a partial `data` object from defined DTO keys only, throws `BadRequestException('No fields to update')` if empty; audit events `supplier.created` / `supplier.updated` via `IdentityAuditClient`.
- `suppliers.controller.ts`: `@Controller({path:'suppliers', version:'1'})`, `@UseGuards(ActorGuard)`. Routes: `POST /`, `GET /`, `GET /:id` (ParseUUIDPipe), `PATCH /:id` (ParseUUIDPipe). **No DELETE route.**
- `suppliers.module.ts`: declares controller + service, exports `SuppliersService` (consumed by `purchase-orders` module for supplier existence checks).
- No dedicated activate/deactivate endpoint — deactivation is `PATCH /:id { isActive: false }`. No guard prevents creating a PurchaseOrder against an inactive supplier today (`purchase-orders.service.ts` `requireSupplier()` checks tenant+existence only, not `isActive`) — this is pre-existing behavior, not something Supplier V1 changes.
- Test coverage (`suppliers.service.spec.ts`): create normalization + audit, duplicate-code conflict, tenant-scoped list/getById, cross-tenant 404. No `update()` tests, no controller tests, no gateway tests, no UI tests.

### 1.4 API Gateway (`apps/api-gateway/src/purchase/`)
- `dto/supplier.dto.ts` — Swagger-decorated duplicate of the purchase-service DTOs, plus response shapes `SupplierDto`, `SupplierListDto`.
- `suppliers.controller.ts` — `@Controller({path:'suppliers', version:'1'})`, `JwtAuthGuard + PermissionsGuard`, routes gated by `SUPPLIERS_CREATE/READ/UPDATE` (`libs/common/src/rbac/permissions.ts:45-47`, already seeded in `apps/identity-service/prisma/seed.ts:181-183`). **No `SUPPLIERS_DELETE` permission exists.**
- `purchase-forward.service.ts` (`PurchaseForwardService`) — shared generic 1:1 HTTP proxy for all Purchase controllers: resolves purchase-service base URL via `DownstreamRegistry`, strips client-supplied `tenantId`/`tenant_id`, forwards `x-actor-user-id`/`x-actor-tenant-id` headers derived from the JWT, unwraps `{success,data}` envelope, maps upstream errors to Nest exceptions.
- `purchase-admin.module.ts` — registers `SuppliersController`, `PurchaseOrdersController`, `GoodsReceiptsController`, provides `PurchaseForwardService`.
- Tests: `purchase.guards.spec.ts` only verifies JWT/RBAC gating via probe controllers — no `SuppliersController`/`PurchaseForwardService`-specific spec.

### 1.5 Angular (`apps/web/src/app/features/purchase/`)
- Models: `apps/web/.../models/purchase.models.ts` — `Supplier{id,tenantId,code,name,address,isActive,createdAt,updatedAt}`, `CreateSupplierRequest`, `UpdateSupplierRequest`, generic `ItemList<T>`.
- Service: `suppliers/supplier.service.ts` — `list/getById/create/update` via shared `ApiClient`.
- UI: single `supplier-list.component.ts`/`.html` (no separate form component) — list table + create/edit modal + detail modal. Fields: Code, Name, Address (maxlength 255), isActive (checkbox, edit-only). Permission-gated Create/Edit via `PermissionService` (`SUPPLIERS_CREATE`/`SUPPLIERS_UPDATE`). No delete/deactivate button beyond the edit-modal checkbox. No `.scss`, no `.spec.ts`.
- Module/routing: `PurchaseFeatureModule` declares `SupplierListComponent`; route `path:'suppliers'` is the default redirect target under Purchase.

### 1.6 Cross-cutting conventions confirmed repo-wide (apply to all Purchase work)
- **Tenancy**: `ActorGuard` + `@CurrentActor()` + `ActorContext{userId,tenantId}` duplicated per service (not shared in `libs/common`), populated from `x-actor-user-id`/`x-actor-tenant-id` headers set by each gateway forward service. No Prisma middleware/`$extends` — every query manually includes `tenantId`. This is the mandatory pattern, see Architectural Rules.
- **UUID references**: same-DB entities get real Prisma `@relation` FKs (e.g. `PurchaseOrder.supplierId`). Cross-microservice entities (e.g. Customer's `paymentTermId`/`fiscalPositionId`/`industryId`, GoodsReceipt's `warehouseId`) are plain `String? @db.Uuid` columns, `@IsUUID()` DTO validation only, **no relation, no synchronous existence-check HTTP call anywhere in the codebase** for this class of reference. Explicit migration comment in sales-service confirms this is deliberate: "Master-data UUIDs intentionally have no foreign keys: that data belongs to a separate service/database."
- **Permissions**: no DELETE permission exists for Supplier or Customer anywhere — consistent with "no hard delete on the parent entity" convention. Address sub-resources (e.g. `CustomerAddress`) do get a DELETE route, reusing the parent's `_UPDATE` permission rather than a dedicated permission.
- **Migrations**: additive-only; new columns nullable/defaulted; destructive steps (e.g. dropping a legacy column) only ever done in the same migration immediately after a safe backfill — never speculatively across phases.
- **Tests**: hand-built plain-object Prisma/audit mocks (no `jest-mock-extended`, no `Test.createTestingModule`), spec files beside source. No e2e tests exist anywhere in the repo. No Angular TestBed component tests exist anywhere in the repo (Angular specs, where they exist at all, are plain Jest tests of pure functions/services).

---

## 2. Supplier V1 — Approved Scope

**Supplier core fields (final, approved):**
`id, tenantId, code, name, company, email, phone, jobPosition, website, gstin, tags, paymentTermId, fiscalPositionId, industryId, notes, address (legacy, retained as-is), isActive, createdAt, updatedAt`

**SupplierAddress (new sub-resource, separate model):**
`id, tenantId, supplierId, type (BILLING|DISPATCH), name, addressLine1, addressLine2, city, state, postalCode, country, phone, isDefault, isActive, createdAt, updatedAt`

**Explicitly NOT part of Supplier V1** (approved exclusions): bank details, PAN, currency, payable account, AP/accounting fields, buyer/purchaser field, salesperson field, supplier category, contact-person subentity, BusinessPartner abstraction.

**Legacy address handling:** `Supplier.address` (free text) is kept unchanged. It is **not** parsed or migrated into `SupplierAddress` rows in this phase. A separate, explicitly reviewed data migration may address this later — out of scope now.

**Important business distinction:** Supplier `DISPATCH` address is the supplier's own shipping/origin address. It is **not** our receiving warehouse — `GoodsReceipt.warehouseId` remains our destination warehouse and is untouched by this work.

**Reference architecture:** Customer/CustomerAddress (`apps/sales-service`) — Supplier V1 mirrors its schema shape, validation conventions, tenancy pattern, and Angular UI architecture field-for-field wherever applicable, substituting `DISPATCH` for `SHIPPING`.

---

## 3. Supplier V1 — Detailed Implementation Plan (summary; see sections 6-10 for specifics)

1. Extend `Supplier` Prisma model with new nullable fields; add `SupplierAddressType` enum and `SupplierAddress` model.
2. One additive Prisma migration (no backfill, no destructive step).
3. Extend `CreateSupplierDto`/`UpdateSupplierDto`; add `CreateSupplierAddressDto`/`UpdateSupplierAddressDto`.
4. Extend `SuppliersService` normalization/eager-loading; add `SupplierAddressesService` (full CRUD, default-exclusivity transaction) and `SupplierAddressesController`.
5. Mirror all DTO/response changes at the API Gateway (`apps/api-gateway/src/purchase/`); add `SupplierAddressesController` there too, reusing existing `SUPPLIERS_*` permissions.
6. Extend Angular models/service; extend the existing `supplier-list.component` (no new component file) with Basic / Legacy Address / Supplier Details / Addresses (Billing, Dispatch) sections, following Customer's `customer-list.component` structure.
7. Extend/add Jest specs for the new service methods, following existing mock conventions.
8. Manual UI verification (dev servers) — no e2e/TestBed suite introduced, consistent with repo norm.

---

## 4. Exact Files Expected to Change

**Backend — purchase-service:**
- `apps/purchase-service/prisma/schema.prisma` (Supplier fields, new enum, new SupplierAddress model)
- `apps/purchase-service/prisma/migrations/<new-timestamp>_supplier_v1_details_and_addresses/migration.sql` (new)
- `apps/purchase-service/src/suppliers/dto/supplier.dto.ts` (extend)
- `apps/purchase-service/src/suppliers/dto/supplier-address.dto.ts` (new)
- `apps/purchase-service/src/suppliers/dto/supplier-address-response.ts` (new)
- `apps/purchase-service/src/suppliers/suppliers.service.ts` (extend)
- `apps/purchase-service/src/suppliers/supplier-addresses.service.ts` (new)
- `apps/purchase-service/src/suppliers/supplier-addresses.controller.ts` (new)
- `apps/purchase-service/src/suppliers/suppliers.module.ts` (register new controller/service)
- `apps/purchase-service/src/suppliers/suppliers.service.spec.ts` (extend)
- `apps/purchase-service/src/suppliers/supplier-addresses.service.spec.ts` (new)

**API Gateway:**
- `apps/api-gateway/src/purchase/dto/supplier.dto.ts` (extend + response DTOs)
- `apps/api-gateway/src/purchase/dto/supplier-address.dto.ts` (new)
- `apps/api-gateway/src/purchase/suppliers.controller.ts` (extend, no route changes)
- `apps/api-gateway/src/purchase/supplier-addresses.controller.ts` (new)
- `apps/api-gateway/src/purchase/purchase-admin.module.ts` (register new controller)

**Angular (apps/web):**
- `apps/web/src/app/features/purchase/models/purchase.models.ts` (extend)
- `apps/web/src/app/features/purchase/suppliers/supplier.service.ts` (extend — address endpoints)
- `apps/web/src/app/features/purchase/suppliers/supplier-list.component.ts` (extend)
- `apps/web/src/app/features/purchase/suppliers/supplier-list.component.html` (extend)

**Documentation:**
- `apps/purchase-service/PURCHASE_MODULE_PLAN.md` (this file — living document)

No changes anywhere in: `apps/inventory-service`, `apps/accounting-service`, `apps/identity-service` (permissions already exist, no seed change needed), Purchase Order / Goods Receipt files, Customer/Sales files.

---

## 5. Exact Files Explicitly Out of Scope

- `apps/purchase-service/src/purchase-orders/**` (all files) — no PO logic/schema/calculation changes.
- `apps/purchase-service/src/goods-receipts/**` (all files) — no GR logic changes; `warehouseId` semantics unchanged.
- `apps/purchase-service/src/inventory/inventory-stock.client.ts` — untouched.
- Any `apps/accounting-service/**` file — no AP/accounting integration.
- Any `apps/sales-service/**` file (Customer/Sales) — reference-only, never modified.
- `apps/identity-service/prisma/seed.ts` — `SUPPLIERS_*` permissions already seeded; no change needed.
- `libs/common/src/rbac/permissions.ts` — no new permission constants needed (address sub-resource reuses `SUPPLIERS_UPDATE`/`SUPPLIERS_READ`).
- Any Angular file outside `apps/web/src/app/features/purchase/`.

---

## 6. Prisma Schema Design

```prisma
enum SupplierAddressType {
  BILLING
  DISPATCH
}

model Supplier {
  id               String   @id @default(uuid()) @db.Uuid
  tenantId         String   @db.Uuid
  code             String
  name             String
  company          String?
  email            String?
  phone            String?
  jobPosition      String?
  website          String?
  gstin            String?
  tags             String[] @default([])
  paymentTermId    String?  @db.Uuid
  fiscalPositionId String?  @db.Uuid
  industryId       String?  @db.Uuid
  notes            String?
  address          String?  // legacy free-text — retained, not migrated
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  purchaseOrders PurchaseOrder[]
  addresses      SupplierAddress[]

  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([tenantId, paymentTermId])
  @@index([tenantId, fiscalPositionId])
  @@index([tenantId, industryId])
  @@map("suppliers")
}

model SupplierAddress {
  id           String              @id @default(uuid()) @db.Uuid
  tenantId     String              @db.Uuid
  supplierId   String              @db.Uuid
  type         SupplierAddressType
  name         String
  addressLine1 String
  addressLine2 String?
  city         String
  state        String?
  postalCode   String?
  country      String
  phone        String?
  isDefault    Boolean             @default(false)
  isActive     Boolean             @default(true)
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  supplier Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([supplierId])
  @@index([tenantId, supplierId, type])
  @@map("supplier_addresses")
}
```

`notes` is new relative to Customer (not on the Customer model) but is in the approved core field list — plain nullable `String?`, `@MaxLength(2000)` at the DTO layer only.

---

## 7. Migration Strategy

Single new additive migration: `apps/purchase-service/prisma/migrations/<timestamp>_supplier_v1_details_and_addresses/migration.sql`, generated via `prisma migrate dev --schema=apps/purchase-service/prisma/schema.prisma` then hand-reviewed:

1. `ALTER TABLE "suppliers" ADD COLUMN` for `company, email, phone, jobPosition, website, gstin, tags text[] DEFAULT '{}', "paymentTermId", "fiscalPositionId", "industryId", notes` — all nullable/defaulted, zero impact on existing rows.
2. **`address` column untouched** — no rename, no drop, no backfill, no data transformation of any kind.
3. `CREATE TYPE "SupplierAddressType" AS ENUM ('BILLING', 'DISPATCH')`.
4. `CREATE TABLE "supplier_addresses" (...)` with FK to `suppliers(id)` `ON DELETE CASCADE`.
5. Indexes: `(tenantId, paymentTermId)`, `(tenantId, fiscalPositionId)`, `(tenantId, industryId)` on `suppliers`; `(tenantId)`, `(supplierId)`, `(tenantId, supplierId, type)` on `supplier_addresses`.

No data backfill step of any kind (unlike Customer's historical address migration) — this satisfies the explicit "do not blindly parse legacy address" requirement.

---

## 8. DTO Validation Rules

Copied verbatim from Customer's proven conventions (`apps/sales-service/src/customers/dto/customer.dto.ts`, `customer-address.dto.ts`):

| Field | Validators |
|---|---|
| `code` | `@IsString() @IsNotEmpty() @MaxLength(32)` |
| `name` | `@IsString() @IsNotEmpty() @MaxLength(160)` |
| `company` | `@IsOptional() @IsString() @MaxLength(160)` |
| `email` | `@IsOptional() @IsEmail() @MaxLength(255)` |
| `phone` | `@IsOptional() @IsString() @MaxLength(64) @Matches(/^[+0-9][0-9().\s-]{5,63}$/)` |
| `jobPosition` | `@IsOptional() @IsString() @MaxLength(160)` |
| `website` | `@IsOptional() @IsUrl({protocols:['http','https'], require_protocol:true}) @MaxLength(255)` |
| `gstin` | `@IsOptional() @IsString() @Matches(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i)` — **optional; strict format only enforced if supplied, never mandatory** |
| `tags` | `@IsOptional() @IsArray() @IsString({each:true}) @MaxLength(64,{each:true})` |
| `paymentTermId`/`fiscalPositionId`/`industryId` | `@IsOptional() @IsUUID()` — format only, **no existence check** (matches repo-wide soft-reference convention) |
| `notes` | `@IsOptional() @IsString() @MaxLength(2000)` |
| `address` (legacy) | `@IsOptional() @IsString() @MaxLength(255)` — unchanged |
| `isActive` | `@IsOptional() @IsBoolean()` (update only) |

`SupplierAddress` DTOs mirror `CustomerAddress` DTOs exactly, with `type: @IsIn(['BILLING','DISPATCH'])` replacing `['BILLING','SHIPPING']`. Required: `name, addressLine1, city, country`. Optional: `addressLine2, state, postalCode, phone, isDefault`. `isActive` optional, update-only.

---

## 9. Service / Controller / API Gateway Design

- `SuppliersService`: extend `create()`/`update()` normalization to match `CustomersService` (email→lowercase/trim, gstin→uppercase/trim, blank optional strings→`null`); extend `list()`/`getById()` to eager-load `addresses` ordered `type asc, isDefault desc, createdAt asc`. Tenant-scoping (`require()`) pattern unchanged.
- New `SupplierAddressesService` (mirrors `CustomerAddressesService`): `requireSupplier()`/`requireAddress()` tenant-scoped helpers; default-exclusivity per `(tenantId, supplierId, type)` enforced inside a `prisma.$transaction` (unset other defaults before setting new one) — no DB-level unique constraint for this, matching Customer. Full CRUD: create/list/update/delete.
- New `SupplierAddressesController` at `suppliers/:supplierId/addresses`, guarded by `ActorGuard`, routes `POST/GET/PATCH/DELETE`.
- `SuppliersModule`: register new controller/service, export both.
- API Gateway: mirror DTOs/response shapes (`SupplierDto` gains new fields; add `SupplierWithAddressesDto`); new `SupplierAddressesController` at gateway level, gated by `SUPPLIERS_READ` (list) / `SUPPLIERS_UPDATE` (create/update/delete) — **no new permission constants**. Register in `purchase-admin.module.ts`. `PurchaseForwardService` requires no changes (generic path-based proxy).

---

## 10. Angular Implementation Design

- Extend `purchase.models.ts`: new `Supplier` fields; add `SupplierAddressType`, `SupplierAddress`, `CreateSupplierAddressRequest`, `UpdateSupplierAddressRequest` (mirrors `sales.models.ts`).
- Extend `supplier.service.ts`: add `listAddresses/createAddress/updateAddress/deleteAddress` against `/v1/suppliers/:id/addresses[/:addressId]`.
- Extend the existing single `supplier-list.component.ts`/`.html` (no new component file, matching Customer's one-component pattern). Form sections, in order:
  1. **Basic** — code, name, company, email, phone, jobPosition, website, tags (chip UI), gstin.
  2. **Legacy Address** — existing `address` textarea, kept and clearly labeled as legacy (not restructured).
  3. **Supplier Details** — paymentTermId/fiscalPositionId/industryId dropdowns (via shared `master-data.service.ts`) + notes.
  4. **Addresses** — Billing and Dispatch sections using `FormArray` + card UI, mirroring Customer's billing/shipping arrays: name/addressLine1/addressLine2/city/state/postalCode/country/phone/isDefault/isActive, add/remove/edit.
  `isActive` checkbox shown only when editing (matches Customer). Table columns extend to include Company/Email/Phone.
- No `.scss`, no `.spec.ts` — consistent with repo norm (Customer has neither).

---

## 11. Permissions and Tenancy Rules

- Reuse existing `SUPPLIERS_CREATE`/`SUPPLIERS_READ`/`SUPPLIERS_UPDATE` (`libs/common/src/rbac/permissions.ts:45-47`, already seeded) for both Supplier and SupplierAddress endpoints — no new permission constants, matching how `CustomerAddress` reuses `CUSTOMERS_UPDATE`.
- Every Supplier and SupplierAddress query/mutation goes through `ActorGuard` → `@CurrentActor()` → explicit `tenantId` filtering in every Prisma query, and the private `require()`/`requireSupplier()`/`requireAddress()` helper pattern (cross-tenant access → 404, never a leaked 403 or data exposure).
- `SupplierAddress.tenantId` is stored redundantly on the address row itself (not derived only via the `supplier` relation) so address queries can be tenant-scoped directly without a join — matches `CustomerAddress`.

---

## 12. Audit Requirements

- Reuse `IdentityAuditClient` exactly as `SuppliersService` already does.
- New audit events: `supplier.address.created`, `supplier.address.updated`, `supplier.address.deleted` — mirrors `customer.address.created/updated/deleted`.
- Existing `supplier.created`/`supplier.updated` events remain, now covering the expanded field set.

---

## 13. Test Plan

- Extend `suppliers.service.spec.ts`: new-field normalization on create/update (email lowercased, gstin uppercased, blank optional strings→null), confirm GSTIN remains optional (no failure when omitted), confirm invalid GSTIN format is rejected when supplied.
- New `supplier-addresses.service.spec.ts` (mirrors `customer-addresses.service.spec.ts`): default-exclusivity transaction per type, tenant-scoped 404 on cross-tenant/cross-supplier access, delete behavior. Hand-built plain-object Prisma/audit mocks — no `jest-mock-extended`, no `Test.createTestingModule` (matches repo convention).
- No new e2e or Angular TestBed specs — none exist for Customer or old Supplier either; intentionally consistent with repo norm.

---

## 14. Verification Plan

1. `npx prisma format && npx prisma validate --schema=apps/purchase-service/prisma/schema.prisma` before generating the migration.
2. `npm run prisma:migrate:purchase` (or equivalent script) to generate the migration; hand-review the generated SQL for additive-only correctness (no unreviewed drops/renames).
3. `npx jest apps/purchase-service/src/suppliers` — run updated/new specs, confirm green.
4. Start api-gateway + purchase-service + web dev servers; manually create/edit a Supplier through the browser covering: all new Basic fields, GSTIN blank (should succeed), GSTIN invalid format (should be rejected), add a Billing and a Dispatch address, mark one default per type, toggle `isActive` on an existing supplier, delete an address.
5. Confirm cross-tenant isolation manually (a second tenant's token cannot see/edit the first tenant's supplier or addresses).
6. Confirm existing Purchase Order supplier-selection flow is unaffected (no PO schema/behavior change).

---

## 15. Known Risks / Decisions

- **Legacy `address` + new `SupplierAddress` sub-resource coexistence**: could read as ambiguous in the UI about which is authoritative. Mitigated by clearly labeling the legacy field ("Legacy Address") rather than removing/restructuring it. A future, separately reviewed phase may decide to retire or migrate it — not decided here.
- **No existence validation for `paymentTermId`/`fiscalPositionId`/`industryId`**: intentional, matches repo-wide convention (same as Customer) — a supplier can reference a deleted/deactivated master-data record; this is pre-existing accepted risk, not introduced by Supplier V1.
- **`SupplierAddress` cascade delete on Supplier deletion**: dormant/defensive only, since Supplier has no hard-delete path (no DELETE endpoint/permission exists).
- **`tags text[] DEFAULT '{}'`** addition is safe for existing rows (all get empty array on migration).

---

## 16. Explicit Architectural Decisions Future Claude Sessions MUST Preserve

- Supplier V1 mirrors Customer's architecture; it does **not** introduce a BusinessPartner abstraction.
- Supplier V1 field set is fixed to the approved list in Section 2 — no bank/PAN/currency/AP/category/contact-person/buyer/salesperson fields without a new, explicit approval.
- `SupplierAddress` is a genuine sub-resource (own controller/service, own endpoints under `suppliers/:supplierId/addresses`), not fields nested inside the Supplier payload.
- `SupplierAddress` type values are `BILLING` and `DISPATCH` — **not** `SHIPPING` (that's Customer's vocabulary).
- Supplier `DISPATCH` address is the supplier's own origin/shipping address — it is **never** to be treated as, aliased to, or merged with `GoodsReceipt.warehouseId` (our receiving warehouse). These remain conceptually and technically distinct.
- Legacy `Supplier.address` is retained unchanged during Supplier V1. Its future retirement or migration requires a separate explicitly approved phase. It must never be silently dropped, renamed, or auto-parsed into `SupplierAddress` rows.
- Supplier (parent) has no hard-delete endpoint/permission — deactivation only, via `isActive`. `SupplierAddress` may have a real `DELETE` endpoint (matches `CustomerAddress`).
- Cross-service UUID references (`paymentTermId`, `fiscalPositionId`, `industryId`) are soft references: `@IsUUID()` DTO validation only, no Prisma relation, no synchronous existence-check HTTP call — unless a future task explicitly justifies adding runtime lookup (no such need currently exists anywhere in this codebase for master-data references).
- Same-microservice references get real Prisma `@relation` FKs (e.g. `SupplierAddress.supplierId` → `Supplier.id`).
- Tenant isolation is always enforced via `ActorGuard` + `@CurrentActor()` + explicit `tenantId` in every Prisma query (plus the `require()`-style helper pattern) — never via a shared middleware/global filter that doesn't exist in this codebase, and never weakened or bypassed.
- Goods Receipt, Inventory receipt behavior, Accounting integration, Purchase Invoice/AP, and Supplier Payments must not be silently modified while working on a different phase (e.g. Purchase Order V1) — any such change requires its own separate, explicitly approved phase.
- Do not invent new architectural abstractions/patterns when an established Customer, Sales, or Purchase pattern already covers the need — extend existing patterns instead (e.g. Purchase Order V1's calculation pipeline deliberately duplicates Sales' `mapLines()`/`sumTotals()` rather than inventing a shared calc library, matching the repo's own established convention).
- **Purchase Order V1 invariants**: `PurchaseOrder`/`PurchaseOrderItem` snapshot fields (`supplierName`, `supplierGstin`, `supplierBillingAddress`, `supplierDispatchAddress`, `paymentTermId`, `productSku`, `productName`, `uomCode`, `uomName`, `conversionFactor`, `taxCode`, `taxCodeName`) are frozen at create/update time and never silently re-derived — only re-snapshotted when the referencing field itself (`supplierId`) changes while still DRAFT. `conversionFactor` is record-only and must never be multiplied into quantity/cost math. Discount is percentage-only (`discountPercent` → derived `discountAmount`) — no flat-amount discount input. Tax is resolved via `taxCodeId` against accounting-service's existing `internal/tax-codes` endpoint (via `AccountingTaxCodeClient`) and UOM via inventory-service's existing `internal/products/:id/uom-options` endpoint (via `InventoryProductClient`) — both reused as-is, never modified. `supplierGstin` is an intentional deviation from the Sales precedent (Sales has no GSTIN snapshot) and must not be "corrected" to match Sales by removing it. All totals/tax/discount amounts are recomputed server-side from scratch on every create/update — client-supplied totals are never trusted.
- This document must be updated with every meaningful Purchase-module change, per the Change History format below.

---

## 17. PO V1 UOM/Inventory Architecture Revision

> **Status: target architecture DIRECTIONALLY APPROVED by the user (2026-09-14). Implementation is NOT YET APPROVED.** No Goods Receipt code, schema, migration, or data has been changed as part of this section. Nothing in Section 17 may be treated as implemented until a future Change History entry explicitly says so, with its own explicit go-ahead.

### 17.1 Trigger

A review of Purchase Order V1 raised the question of whether alternate-UOM quantities (e.g. ordering in BOX when the product's base unit is PCS) are converted to base-unit quantities before they reach Inventory's stock ledger. Direct code inspection of both the Purchase flow (`PurchaseOrder → GoodsReceipt → Inventory`) and the Sales flow (`SalesOrder → Shipment → Inventory`) was performed to answer this precisely, determine whether Purchase Order V1 introduced a new defect or reproduced an existing one, and design a correction.

### 17.2 Finding — no conversion happens in either flow today

**Confirmed by direct code read** (`apps/sales-service/src/shipments/shipments.service.ts`, `apps/sales-service/src/inventory/inventory-stock.client.ts`, `apps/inventory-service/src/stock/stock-issues.service.ts`, `apps/inventory-service/prisma/schema.prisma`, and the equivalent Purchase-side files): **Sales' fulfillment flow has the exact same architecture, and the exact same gap, as Purchase's.** Purchase Order V1 did not introduce a new class of bug — it reproduced a pre-existing, repo-wide limitation identically. `conversionFactor` is captured and stored on both `SalesOrderItem` and `PurchaseOrderItem` as a display/record-only snapshot; it is never multiplied into any quantity anywhere in either service layer, nor in Inventory's `stock-issues.service.ts`/`stock-receipts.service.ts`. `Stock` and `StockMovement` (the shared inventory-service ledger models used by both flows) have a single `quantity: Decimal(19,6)` column each with **no UOM field at all** — the ledger implicitly assumes every quantity that reaches it is already in the product's base unit (`Product.unitOfMeasureId`).

### 17.3 Precise comparison table

| Dimension | Sales: `SalesOrder → Shipment → Inventory` | Purchase: `PurchaseOrder → GoodsReceipt → Inventory` | Same? |
|---|---|---|---|
| Document UOM (order line) | `SalesOrderItem.unitOfMeasureId`/`uomCode`/`uomName`, validated against inventory-service's base+alternatives in `mapLines()` via `InventoryProductClient.getUomOptions()` | `PurchaseOrderItem.unitOfMeasureId`/`uomCode`/`uomName`, identical validation via purchase-service's own copy of the same client | Identical |
| Quantity stored on order line | `SalesOrderItem.quantity` — raw number, in the *selected UOM's* terms, never converted to base | `PurchaseOrderItem.quantity` — same | Identical |
| conversionFactor stored on order line | `SalesOrderItem.conversionFactor` (`Decimal(19,6)?`) — `1` for base UOM, `ProductUnit.conversionFactor` for an alternative; snapshot only, never used in math | `PurchaseOrderItem.conversionFactor` — same | Identical |
| Fulfillment sub-document schema | `ShipmentItem{id,tenantId,shipmentId,salesOrderItemId,productId,productSku,productName,quantity}` — **no UOM/conversionFactor field** | `GoodsReceiptItem{id,tenantId,goodsReceiptId,purchaseOrderItemId,quantity}` — **no UOM/conversionFactor field, and no product snapshot either** | UOM gap identical; Sales additionally snapshots product identity, Purchase does not |
| Quantity stored on fulfillment line | Raw copy of the requested ship quantity, same numeric terms as the order line's `quantity` — no conversion | Raw copy of the requested receive quantity, same pattern | Identical |
| Where UOM→base conversion happens | **Nowhere.** `ShipmentsService` sends `quantityToString(item.quantity)` verbatim to `InventoryStockClient.applyIssue()` | **Nowhere.** `GoodsReceiptsService` sends `quantityToString(item.quantity)` verbatim to `InventoryStockClient.applyReceipt()` | Identical |
| Inventory-side quantity handling | `StockIssuesService.apply()`: `next = current.minus(line.quantity)`, no UOM awareness | `StockReceiptsService.apply()`: `next = current.plus(line.quantity)`, no UOM awareness | Identical |
| Inventory ledger schema | `Stock.quantity`, `StockMovement.quantity` — one `Decimal(19,6)` each, **no UOM column**, shared models used by both flows | Same models, same flows | Identical (one shared ledger, one shared gap) |
| Idempotency mechanism | `stock_receipt_applications` table, keyed `(tenantId, referenceType, referenceId)`, payload-hash guarded, `referenceType='shipment'` | Same table/mechanism, `referenceType='goods_receipt'` | Identical |
| Partial fulfillment accounting | `SalesOrderItem.shippedQuantity` accumulates; status DRAFT→CONFIRMED→PARTIALLY_FULFILLED→FULFILLED | `PurchaseOrderItem.receivedQuantity` accumulates; status DRAFT→CONFIRMED→PARTIALLY_RECEIVED→RECEIVED | Same concept |
| Concurrency safety of partial fulfillment | `preparePendingShipment()` takes raw-SQL `SELECT ... FOR UPDATE` locks on `sales_orders`/`sales_order_items`, **and** sums quantities from other still-`PENDING_STOCK` Shipments via `pendingQuantitiesByOrderItem()` before accepting a new line | `preparePendingReceipt()` uses only a plain Prisma `$transaction` — **no row lock**, checks only `poItem.quantity − poItem.receivedQuantity`, **no accounting for other in-flight `PENDING_STOCK` Goods Receipts** | **Different — Purchase is less robust.** See §17.6. |
| Historical snapshots preserved on fulfillment doc | Yes — `productId`/`productSku`/`productName` copied onto `ShipmentItem` at ship time | **No** — `GoodsReceiptItem` carries no product snapshot; requires a join back to `PurchaseOrderItem` | **Different.** See §17.8. |

### 17.4 Final target architecture (directionally approved; NOT implemented)

**Governing invariants** (all confirmed by the user as the required design):

1. **Purchase Order commercial quantity stays in the selected purchasing UOM.** `PurchaseOrderItem.quantity` is, and remains, denominated in whatever `unitOfMeasureId` was chosen at order time (e.g. `2` when `uomCode = 'BOX'`, `BOX = 10 PCS`). Nothing about this changes from the already-implemented PO V1.
2. **Goods Receipt quantity stays in the PO's selected UOM — never converted at the document level.** If the PO line is in BOX, the receipt quantity the warehouse enters (e.g. "receive 1 BOX") is stored as `1`, in BOX terms, on `GoodsReceiptItem.quantity` — not pre-converted to PCS before storage.
3. **PO `quantity`/`receivedQuantity` must never mix units.** `PurchaseOrderItem.receivedQuantity` accumulates `GoodsReceiptItem.quantity` values directly (both in the same commercial UOM as the PO line) — exactly as `finalizePosted()` already does today. It is never permitted to add a PCS-denominated number to a BOX-denominated `receivedQuantity`, or vice versa.
4. **`GoodsReceiptItem` must carry a historical UOM/conversion snapshot**, frozen at receipt-creation time, sufficient on its own to reconstruct what was actually received and what it meant in base-unit terms — without depending on any external, potentially-changed, master-data lookup. Using the exact field names already established on `PurchaseOrderItem` for consistency:
   - `unitOfMeasureId String? @db.Uuid`
   - `uomCode String?`
   - `uomName String?`
   - `conversionFactor Decimal? @db.Decimal(19, 6)`

   All four are copied verbatim from the **parent `PurchaseOrderItem`** at the moment the `GoodsReceiptItem` row is created — never re-fetched from inventory-service, never re-resolved against the *current* `ProductUnit` table.
5. **Goods Receipt must NOT re-resolve the conversion factor from the current `ProductUnit`/`InventoryProductClient.getUomOptions()` during posting.** The `conversionFactor` used for every calculation involving a given receipt is the one **frozen on that `GoodsReceiptItem` row** (copied from the PO item at receipt time), full stop — even if `ProductUnit.conversionFactor` for that product/UOM combination is edited in master data afterward. This makes historical receipts immune to later master-data edits, by design (see §17.5, "conversion factor change after PO creation").
6. **Inventory remains completely unchanged.** `Stock`, `StockMovement`, `CreateStockReceiptDto`, `stock-receipts.service.ts` — none of it is touched. Inventory continues to store and receive **base-UOM quantities only**, exactly as today; it has no UOM awareness and none is added.
7. **Conversion happens exactly once, at the Purchase → Inventory boundary, using the frozen historical factor:**
   ```
   inventoryQuantity = receiptQuantity × historicalConversionFactor
   ```
   where `receiptQuantity` is `GoodsReceiptItem.quantity` (commercial/PO UOM, e.g. `1` BOX) and `historicalConversionFactor` is `GoodsReceiptItem.conversionFactor` (the frozen snapshot, e.g. `10`), producing `inventoryQuantity = 10` (base-unit PCS) — the value sent to `InventoryStockClient.applyReceipt()`. This computed value is proposed to be stored on the `GoodsReceiptItem` row itself as `baseQuantity Decimal? @db.Decimal(19, 6)`, so it never needs to be recomputed (e.g. on the `post()` retry path) and is always traceable after the fact.

**Schema change — `GoodsReceiptItem` (additive/nullable only, target shape):**
```prisma
model GoodsReceiptItem {
  id                  String   @id @default(uuid()) @db.Uuid
  tenantId            String   @db.Uuid
  goodsReceiptId      String   @db.Uuid
  purchaseOrderItemId String   @db.Uuid
  quantity            Decimal  @db.Decimal(19, 6)  // UNCHANGED — commercial/PO UOM, e.g. "1" (BOX)

  // NEW — historical snapshot, copied verbatim from the parent PurchaseOrderItem
  // at receipt-creation time. Never re-resolved from current master data.
  productSku       String?
  productName      String?
  unitOfMeasureId  String?  @db.Uuid
  uomCode          String?
  uomName          String?
  conversionFactor Decimal? @db.Decimal(19, 6)

  // NEW — computed once at creation: quantity × conversionFactor.
  // The only value ever sent to Inventory.
  baseQuantity     Decimal? @db.Decimal(19, 6)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  goodsReceipt      GoodsReceipt      @relation(fields: [goodsReceiptId], references: [id], onDelete: Cascade)
  purchaseOrderItem PurchaseOrderItem @relation(fields: [purchaseOrderItemId], references: [id], onDelete: Restrict)
}
```

**Service-layer changes required (NOT implemented — `apps/purchase-service/src/goods-receipts/goods-receipts.service.ts`):**
- `preparePendingReceipt()`: for each line, copy `productSku`/`productName`/`unitOfMeasureId`/`uomCode`/`conversionFactor` from the loaded `poItem` onto the new `GoodsReceiptItem` row (no external calls — the PO item is already loaded in this method today); compute `baseQuantity = qty.mul(poItem.conversionFactor ?? new Decimal(1))`. The `remaining = poItem.quantity − poItem.receivedQuantity` check stays exactly as today, in commercial-UOM terms (invariant 3).
- `inventoryLines` (built for `InventoryStockClient.applyReceipt()`) must use `baseQuantity`, never `quantity`.
- `post()` (retry path): rebuild `inventoryLines` from the already-stored `baseQuantity` column on each `GoodsReceiptItem` — never recompute, never re-resolve conversion factor (invariant 5).
- `finalizePosted()`: unchanged — `receivedQuantity` bookkeeping stays entirely in commercial-UOM terms.

### 17.5 Invariants and worked examples

**Base UOM (conversionFactor = 1):**
- Product base UOM = PCS. PO line: `quantity = 10`, `unitOfMeasureId = PCS`, `conversionFactor = 1`.
- Receipt of `quantity = 10` (PCS) → `GoodsReceiptItem.conversionFactor = 1` (copied from PO item) → `baseQuantity = 10 × 1 = 10` → Inventory receives `10`. No behavior change from today.

**Alternate UOM:**
- Product base UOM = PCS, alternate UOM = BOX, `ProductUnit.conversionFactor = 10` at PO-creation time. PO line: `quantity = 2`, `unitOfMeasureId = BOX`, `conversionFactor = 10` (snapshotted onto `PurchaseOrderItem` at order time, per existing PO V1 behavior).
- Goods Receipt created for `quantity = 2` (BOX) → `GoodsReceiptItem` copies `conversionFactor = 10` from the PO item → `baseQuantity = 2 × 10 = 20` → Inventory receives `20` (PCS). **This is the corrected behavior** — today (pre-fix) Inventory would incorrectly receive `2`.

**Partial receipt:**
- Same PO line (`quantity = 2` BOX, `conversionFactor = 10`). First Goods Receipt: `quantity = 1` (BOX) → `baseQuantity = 1 × 10 = 10` → Inventory `+10`. `PurchaseOrderItem.receivedQuantity` becomes `1` (BOX) — **not** `10` — since invariant 3 keeps `receivedQuantity` in commercial-UOM terms, consistent with `quantity`. `1 < 2` → PO status `PARTIALLY_RECEIVED`.

**Multiple partial receipts:**
- Continuing the above: a second Goods Receipt for the remaining `quantity = 1` (BOX) → `baseQuantity = 1 × 10 = 10` → Inventory `+10` again (total `+20` across both receipts, matching the single-receipt example above). `receivedQuantity` becomes `1 + 1 = 2` = `quantity` → PO status `RECEIVED`. Each receipt independently copies its own `conversionFactor` snapshot from the PO item — since the PO item is immutable once `CONFIRMED`, both receipts get the identical factor (`10`) in this scenario.

**Conversion factor changed after PO creation:**
- PO created with `conversionFactor = 10` (snapshotted onto `PurchaseOrderItem` at order time, per existing PO V1 create/update logic). Master data is later edited: `ProductUnit.conversionFactor` for BOX changes from `10` to `12` (e.g. a packaging change).
- A Goods Receipt created **after** this master-data edit for the same, still-open PO line **must still use `10`**, not `12` — because invariant 5 forbids re-resolving the conversion factor from current `ProductUnit` at receipt time; the value copied is always the one frozen on the `PurchaseOrderItem` at the time *that PO line* was created (or last updated while DRAFT), never a fresh master-data lookup. This is what makes historical receipts immune to later master-data changes and is the entire reason `conversionFactor` must be copied from the **PO item**, not re-fetched from inventory-service, during Goods Receipt creation.

### 17.6 Goods Receipt concurrency

**Sales' existing approach** (`ShipmentsService.preparePendingShipment()`): takes raw-SQL `SELECT ... FOR UPDATE` locks on the relevant `sales_orders` row and all `sales_order_items` rows for that order, inside the same transaction that creates the `PENDING_STOCK` Shipment; additionally calls `pendingQuantitiesByOrderItem()`, which sums quantities already committed to *other*, still-`PENDING_STOCK` (i.e. created but not yet finalized/posted) Shipments for the same order, and includes that sum when computing `remaining` for the new shipment line. This closes the race where two concurrent shipment-creation requests could each see stale `shippedQuantity` and both accept quantities that, combined, exceed what was ordered.

**Purchase's current state** (`GoodsReceiptsService.preparePendingReceipt()`): uses only a plain Prisma `$transaction` — no `FOR UPDATE` row lock on `purchase_orders`/`purchase_order_items`, and no equivalent "sum other in-flight `PENDING_STOCK` Goods Receipts" check. Two concurrent `create()` calls against the same `PurchaseOrderItem` could each read the same not-yet-updated `receivedQuantity`, both validate successfully, and together over-receive past the ordered quantity — a real, verified gap, not present in the Sales equivalent.

**Required PO V1 concurrency behavior (target — NOT implemented):**
- `preparePendingReceipt()` must take the same style of `SELECT ... FOR UPDATE` lock on the `purchase_orders` row and all `purchase_order_items` rows for that order, inside its existing transaction.
- A new `pendingQuantitiesByPurchaseOrderItem()` helper (mirroring `ShipmentsService.pendingQuantitiesByOrderItem()` exactly) must sum quantities from other still-`PENDING_STOCK` Goods Receipts for the same PO item, and that sum must be subtracted from `remaining` alongside the already-committed `receivedQuantity`, before a new receipt line is accepted.
- No schema change is required for this — it is purely a `goods-receipts.service.ts` logic change, symmetric with the existing Sales implementation.
- This is being **specified as a requirement now, to be implemented together with the UOM fix** (since both live in `preparePendingReceipt()`), but **no code will be written until this document's overall implementation is explicitly approved.**

### 17.7 Sales carries the identical UOM/Inventory gap — explicitly out of scope here

Sales' `ShipmentItem`/`ShipmentsService`/`InventoryStockClient.applyIssue()` has the **exact same** alternate-UOM-to-Inventory conversion gap as Purchase (§17.2, §17.3) — confirmed by direct code read, not assumed. **This is treated as a separate, future Sales-side correction, tracked here for visibility only.** Purchase Order V1 (and this Section 17 revision) must **not** be expanded to modify anything under `apps/sales-service/**` or `apps/inventory-service/**`. If and when a symmetric Sales fix is undertaken, it should mirror this section's design (`ShipmentItem` gains the same 4 UOM snapshot fields + `baseQuantity`, `ShipmentsService` stops sending raw `quantity` to `applyIssue()`), but that is out of scope for the Purchase module and for this document.

### 17.8 Historical snapshot requirement — what is snapshotted and why

| Document | Snapshotted fields | Copied from | Why |
|---|---|---|---|
| `PurchaseOrder` (header) | `supplierName`, `supplierGstin`, `supplierBillingAddress`, `supplierDispatchAddress`, `paymentTermId` | `Supplier` + `SupplierAddress` at order create/update time | So the order reflects the supplier as it was when ordered, immune to later supplier edits (Supplier V1 invariant, unchanged by this section) |
| `PurchaseOrderItem` (line, already implemented) | `productSku`, `productName`, `unitOfMeasureId`, `uomCode`, `uomName`, `conversionFactor`, `taxCode`, `taxCodeName` | `Product` + `InventoryProductClient.getUomOptions()` + `AccountingTaxCodeClient.getById()` at order create/update time | So the order reflects the product/UOM/tax as they were when ordered, immune to later product/tax-code edits (already-implemented PO V1 invariant, unchanged by this section) |
| `GoodsReceiptItem` (line, **proposed by this section**) | `productSku`, `productName`, `unitOfMeasureId`, `uomCode`, `uomName`, `conversionFactor` | The parent **`PurchaseOrderItem`** (never re-fetched from `Product`/`ProductUnit`/inventory-service) at receipt-creation time | Two distinct reasons: **(a)** closes the "historical snapshots preserved" gap identified in §17.3 — a receipt row should be self-describing without a join, matching Sales' `ShipmentItem` parity; **(b)** is the mechanism that makes invariant 5 (§17.4) possible — the conversion factor used for a receipt must survive any later change to `ProductUnit.conversionFactor`, so it has to be copied from the immutable `PurchaseOrderItem`, not re-resolved live |

`GoodsReceiptItem.baseQuantity` is not a "snapshot" in the same sense — it is a **derived value**, computed once (`quantity × conversionFactor`) and stored for traceability/idempotency, not copied from anywhere.

### 17.9 Migration strategy — strictly non-destructive

The following rules govern this fix's eventual migration, and are recorded here as binding constraints on any future implementation of this section:

1. **Never truncate `purchase_orders`, `purchase_order_items`, `goods_receipts`, or `goods_receipt_items`** (or any other transactional table) to make a migration apply. If a target column must be `NOT NULL` and existing rows can't populate it from available data, the column stays **nullable** instead — schema correctness is never purchased with data loss.
2. **Never delete transactional history** of any kind to simplify a migration.
3. **Additive-only, with backfill where possible, never backfill-by-deletion**: the eventual migration adds only new, nullable columns to `goods_receipt_items` (§17.4's schema block) — no `DROP COLUMN`, no type narrowing, no new `NOT NULL` without a default.
4. **Backfill logic for any environment that already has `goods_receipt_items` rows at implementation time** (specified now for completeness, not applicable to the current local DB — see §17.10):
   - `baseQuantity`/`conversionFactor` for pre-existing rows: backfill `conversionFactor = 1`, `baseQuantity = quantity`. This is the **only truthful assumption possible** — prior to this fix, every existing receipt was sent to Inventory as raw `quantity` with an implicit `conversionFactor = 1`, so this backfill exactly reproduces what Inventory actually already recorded historically. It does **not** and must **not** attempt to retroactively correct any `Stock.quantity` value.
   - `productSku`/`productName`/`unitOfMeasureId`/`uomCode` for pre-existing rows: backfill via a join back to the parent `PurchaseOrderItem` (`purchaseOrderItemId`), which still holds this data — no value is invented.
5. **Already-applied migrations must never be edited or rewritten.** `20260819120000_purchase_domain_v1`, `20260913183953_supplier_v1_details_and_addresses`, and `20260913191233_purchase_order_v1_uom_discount_tax_snapshot` are final as applied. Any corrective or additive change — including everything in this section — must ship as a **new** migration file appended after them, never as an edit to an existing one.

### 17.10 Prior local TRUNCATE — explicitly not a precedent

The `TRUNCATE TABLE goods_receipt_items, goods_receipts, purchase_order_items, purchase_orders CASCADE;` executed earlier in this session (recorded in the Change History entry for "Purchase Order V1 implemented") was a **one-time, local-development-environment data reset**, performed only because the rows in question were confirmed, dated, disposable manual-test fixtures with zero recoverable product-identity data, and only to allow the *initial* PO V1 migration (which added genuinely new `NOT NULL` columns with no possible backfill source) to apply against an empty table. **It is explicitly recorded here that this was not, and must never be treated as, an acceptable migration or deployment strategy.** No future migration — including the one proposed in §17.4/§17.9 — may truncate or delete transactional data to resolve a schema conflict. §17.9's rules govern all future Purchase-module migrations from this point forward.

### 17.11 Explicit scope boundary

Accounting/AP integration, Purchase Invoice, and supplier-payment posting remain entirely **out of scope** for Purchase Order V1 and for this Section 17 revision. Nothing in this section proposes, requires, or depends on any of: a `JournalEntry`/AP posting, a `PurchaseInvoice` model, or a `SupplierPayment` model. Those remain roadmap-only per Section 1's status line and the existing Change History.

### 17.12 Architectural rule to add to Section 16 once this is approved and implemented

*"Any quantity purchase-service (or sales-service) sends to inventory-service's `internal/stock/*` endpoints must be in the product's base UOM. `PurchaseOrderItem.conversionFactor` and `GoodsReceiptItem.conversionFactor` snapshots exist so this conversion can happen exactly once, at the Purchase→Inventory boundary, using the historically-frozen factor — never re-resolved from current master data at receipt time, and never assume Inventory performs any conversion itself."* Not added yet — pending implementation approval.

### 17.13 Approval status

- **Target architecture (§17.4–§17.9)**: directionally approved by the user, 2026-09-14.
- **Implementation**: **not approved.** No schema, migration, service, controller, Angular, or test code for this section exists. A separate, explicit go-ahead is required before any of §17.4's schema change or §17.4/§17.6's service-layer changes are written.

---

## 18. Purchase Order V1 — Sales-Order-Like Document Structure

> **Status: IMPLEMENTED (2026-09-14) — see the "Purchase Order V1 extended into a full business document" Change History entry for exact detail.** All header fields listed in §18.2 are implemented (PO Number, Supplier, Supplier Reference, Order Date, Expected Delivery Date, Buyer/Purchaser, Payment Terms — now independently overridable — Receiving Warehouse, Supplier Billing/Dispatch Address snapshots, Notes). Currency and everything else in §18.3 remains explicitly deferred, unchanged. §18.9 records the actual implementation status in place of the original pre-implementation placeholder text.

### 18.1 Purpose

Purchase Order V1 should be treated as a complete business document, not only as a supplier plus product-line list.

The Purchase Order UI/API should follow the existing Sales Order document pattern where applicable, while respecting Purchase-specific business rules.

The goal is to provide proper PO header information, supplier/address snapshots, purchasing responsibility, delivery expectations, line-level commercial information, and document totals.

### 18.2 Purchase Order Header Fields

The following fields are part of Purchase Order V1:

- **PO Number** — system-generated tenant-scoped document number. Must be treated as the business document number, separate from the database UUID.
- **Supplier** — supplier selection by `supplierId`. Supplier name/GSTIN/address information is snapshotted according to the approved PO snapshot rules (Section 16, §18.6).
- **Supplier Reference** — optional supplier-provided reference such as a quotation/reference number.
- **Order Date** — purchase order date.
- **Expected Delivery Date** — optional expected delivery date for the purchase order.
- **Buyer / Purchaser** — optional Identity user reference representing the internal purchaser responsible for the PO. This is an Identity user reference, not a Master Data entity.
- **Payment Terms** — optional Master Data payment-term reference.
- **Receiving Warehouse** — optional/default destination warehouse for the purchase order. The actual Goods Receipt warehouse remains the operational destination used when receiving stock.
- **Supplier Billing Address** — snapshot of the selected supplier billing address.
- **Supplier Dispatch Address** — snapshot of the selected supplier dispatch/origin address.
- **Notes / Terms & Conditions** — free-text purchase/order notes.

### 18.3 Explicitly Deferred Fields

Currency is intentionally **NOT** part of Purchase Order V1.

Currency and related functionality will be introduced in a later phase together with the broader purchasing/accounting design.

Deferred items include:

- Currency
- Exchange rate
- Multi-currency pricing
- Purchase Invoice
- Accounts Payable
- Supplier payments
- Accounting posting

Do not add currency fields merely to prepare for the future phase.

### 18.4 Purchase Order Line Fields

Each Purchase Order line should contain:

- Product
- Product SKU/name snapshot
- Description
- Unit of Measure
- Quantity
- Unit Cost
- Discount %
- Tax Code
- Tax component snapshots
- Line Subtotal
- Tax Amount
- Line Total
- Conversion Factor snapshot

The selected commercial UOM and historical conversion factor follow Section 17.

### 18.5 Purchase Order Document Totals

The Purchase Order header stores calculated totals:

- Subtotal
- Discount Total
- Tax Total
- Grand Total

Calculation remains server-authoritative and follows the approved Purchase/Sales calculation convention:

```
gross            = quantity × unitCost
discountAmount   = gross × discountPercent / 100
lineSubtotal     = gross - discountAmount
```

Each tax component is calculated independently and rounded according to the established 4-decimal HALF_UP rule.

```
lineTotal = lineSubtotal + taxAmount
```

Document totals are calculated from the already-rounded line values.

### 18.6 Snapshot Rules

The Purchase Order must preserve historical commercial information.

At creation, the PO snapshots the relevant supplier, address, product, UOM, conversion factor, tax, and commercial values.

While the PO is DRAFT:

- Changing the supplier may refresh supplier/address snapshots.
- Changing the selected supplier address may refresh the corresponding address snapshot.
- Other saved snapshots must not be silently re-derived from current master data.

Once the PO leaves DRAFT, historical snapshots are immutable.

Downstream Goods Receipt processing must use the persisted PO/UOM/conversion information and must not re-resolve historical conversion factors from current `ProductUnit` master data — consistent with Section 17's invariants.

### 18.7 UI Structure

The Angular Purchase Order screen should be structured as a business document similar in concept to the Sales Order screen rather than presenting only a flat product list.

Recommended structure:

1. **PO Header** — PO Number, Supplier, Supplier Reference, Order Date, Expected Delivery Date, Buyer/Purchaser, Payment Terms, Receiving Warehouse.
2. **Supplier / Address Information** — Billing Address, Dispatch Address.
3. **Order Lines** — Product, Description, UOM, Quantity, Unit Cost, Discount %, Tax, Line Subtotal, Tax Amount, Line Total.
4. **Totals** — Subtotal, Discount, Tax, Grand Total.
5. **Notes / Terms & Conditions**.

The UI should remain consistent with existing Sales document patterns where practical, but should not introduce unrelated Sales-only fields or workflows.

### 18.8 Scope Boundary

This enhancement does **NOT** introduce:

- Purchase Invoice
- AP
- Supplier payment
- Accounting journal posting
- Currency
- Multi-currency
- Supplier buyer/person master-data entity
- Changes to Sales
- Changes to Inventory beyond the already-approved Section 17 boundary

Any such functionality requires a separate reviewed plan/phase.

### 18.9 Implementation Status

**Implemented 2026-09-14**, after explicit approval. Before writing any code, the already-implemented PO V1 code (Prisma schema, service, DTOs, gateway, Angular), Goods Receipt's compatibility contract, and Sales Order's reference implementation (numbering, snapshot, UOM, calculation, and Identity-reference conventions) were all inspected directly — none were assumed correct merely because they already existed.

`PurchaseOrder` gained: `poNumber` (system-generated, tenant-scoped, `PO-00000001`-style, `@@unique([tenantId, poNumber])`, allocated via the same count-based-with-retry-on-collision pattern already used by `SalesInvoice.invoiceNumber`/`ProformaInvoice.documentNumber`), `supplierReference` (free text), `expectedDeliveryDate` (nullable date), `buyerId` (soft Identity-user UUID reference, no relation, no existence check — mirrors `SalesOrder.salespersonId` exactly), and `warehouseId` (soft receiving-warehouse UUID reference, informational only — never conflated with `GoodsReceipt.warehouseId`, which remains the sole operational receiving destination). `paymentTermId` — already present as a supplier-derived snapshot field — became independently overridable per order (`dto.paymentTermId ?? supplier default` on create; explicit-value-wins / re-derive-only-on-supplier-change on update), mirroring `SalesOrdersService.update()`'s `paymentTermId`/`salespersonId` handling exactly.

One additional validation rule was added beyond what Section 18 itself specified: an alternate (non-base) UOM line whose `conversionFactor` from `InventoryProductClient.getUomOptions()` is missing or not a valid positive decimal is now rejected (`BadRequestException`) rather than silently accepted — closing a gap in the original PO V1 implementation where an invalid alternate factor would have thrown from the raw `Prisma.Decimal` constructor instead of a clean validation error. This does not alter Section 17's already-approved UOM architecture; it only hardens the existing "resolve UOM, validate the product/UOM pairing" step already present in `mapLines()`.

No conflict with Goods Receipt's existing compatibility contract was found: `preparePendingReceipt()`/`finalizePosted()` in `goods-receipts.service.ts` were re-read and confirmed to depend only on `PurchaseOrderItem.quantity`/`receivedQuantity`/`productId` — none of which changed shape or semantics. No Goods Receipt file was touched. Section 19's GR UOM/conversion-factor enhancement remains entirely unimplemented and out of scope for this change.

The implementation must remain additive/non-destructive and must not truncate or delete transactional data.

---

## 19. Goods Receipt V1 — Implementation Plan

> **Status: PLANNING ONLY (2026-09-14). Not approved for implementation. No schema, migration, service, controller, Angular, or test code for this section exists. This section specifies how Goods Receipt V1 will be built once implementation is explicitly approved, strictly following Section 17's already-approved UOM/Inventory target architecture — it does not alter or reinterpret Section 17, it implements it.**

### 19.1 Business Purpose and Relationship

Goods Receipt V1 formalizes the receiving step of the Purchase flow:

`Purchase Order → Goods Receipt → Inventory`

A Goods Receipt records that some or all of a Purchase Order's ordered quantity has physically arrived at a warehouse, and is the single point where Purchase-side commercial quantities are converted to Inventory's base-UOM stock quantities, per Section 17.

### 19.2 Goods Receipt Header

- **GR Number** — system-generated tenant-scoped document number; the business-document identity, separate from the database UUID (mirrors PO Number, Section 18.2).
- **Purchase Order** — reference to the source `PurchaseOrder` (`purchaseOrderId`, already the model's parent relation).
- **Supplier snapshot/reference** — the GR does not re-select a supplier; it inherits/records the PO's supplier reference for traceability so a receipt is self-describing without always joining back to the PO for basic identification.
- **Warehouse** — the destination/receiving warehouse (`warehouseId`, already existing, unchanged semantics — never the supplier's Dispatch address, per Section 2/16).
- **Receipt Date** — `receivedAt`, already existing.
- **Status** — existing `PENDING_STOCK|POSTED` enum, unchanged.
- **Notes** — optional free text, where appropriate, mirroring PO Notes (Section 18.2).

### 19.3 Goods Receipt Lines

- **PO item reference** — `purchaseOrderItemId` (existing).
- **Product SKU/name snapshot** — new, copied from the parent `PurchaseOrderItem` at receipt-creation time (Section 17.4/17.8).
- **UOM snapshot** — `unitOfMeasureId`/`uomCode`/`uomName`, copied from the parent `PurchaseOrderItem` (Section 17.4).
- **conversionFactor snapshot** — copied from the parent `PurchaseOrderItem`, never re-resolved (Section 17.4 invariant 5).
- **Received quantity** — `quantity`, stored in the PO's selected commercial UOM (Section 17.4 invariant 2) — unchanged from today.
- **baseQuantity** — derived once at creation (`quantity × conversionFactor`), the only value ever sent to Inventory (Section 17.4 invariant 7).

### 19.4 UOM Architecture — Must Follow Approved Section 17

Goods Receipt V1 implements Section 17's already-approved target architecture exactly, with no deviation:

- PO `quantity` remains in the selected commercial UOM (Section 17.4 invariant 1) — unchanged.
- GR `quantity` remains in that same commercial UOM (Section 17.4 invariant 2) — never pre-converted at the document level.
- `PurchaseOrderItem.receivedQuantity` accumulates GR `quantity` values directly, in the same commercial UOM — never mixed with base-UOM values (Section 17.4 invariant 3).
- Conversion to base UOM happens **exactly once**, at the Purchase → Inventory boundary, using the historically-frozen `conversionFactor` snapshot (Section 17.4 invariants 4, 5, 7).
- Inventory receives **base-UOM quantity only** (`baseQuantity`) — Inventory itself is unchanged (Section 17.4 invariant 6).
- The `post()` retry path rebuilds Inventory lines from the already-persisted `baseQuantity` column — it never recomputes and never re-resolves `conversionFactor` from current `ProductUnit`/`InventoryProductClient` (Section 17.4 invariant 5).
- Base-UOM lines must use `conversionFactor = 1` (Section 17.5 worked example).
- **New validation rule, not previously stated in Section 17**: if a PO line's selected UOM is an alternate (non-base) UOM and its `conversionFactor` is missing or invalid (`<= 0`, non-numeric) at the moment a Goods Receipt line is prepared, that receipt line must be **rejected** with a validation error — it must never silently default to `conversionFactor = 1`, since that would silently under-post Inventory. This is a defensive backstop for receipt time on top of the UOM validation `mapLines()` already performs at PO create/update time; it does not modify or relax anything Section 17 already specifies.

### 19.5 Receiving Behavior

- **Full receipt** — a single GR whose lines fully cover each PO line's remaining quantity.
- **Partial receipt** — a GR covering less than the remaining quantity; `receivedQuantity` accumulates, PO status becomes `PARTIALLY_RECEIVED`.
- **Multiple partial receipts** — repeated partial receipts accumulate until `receivedQuantity = quantity`, at which point PO status becomes `RECEIVED` (existing `finalizePosted()` behavior, unchanged).
- **Remaining quantity** — `remaining = poItem.quantity − poItem.receivedQuantity`, computed in commercial-UOM terms (unchanged from today, Section 17.4 invariant 3).
- **Over-receipt prevention** — a GR line must never be accepted if it would push `receivedQuantity` above `quantity` for that PO line, accounting for other in-flight `PENDING_STOCK` receipts (§19.6).
- **Receipt against confirmed/receivable PO only** — a GR may only be created against a PO in `CONFIRMED` or `PARTIALLY_RECEIVED` status (existing rule, unchanged).
- **PO status transitions** — `CONFIRMED → PARTIALLY_RECEIVED → RECEIVED`, driven by `finalizePosted()` on GR posting (existing, unchanged).
- **`receivedQuantity` updates** — accumulate directly from GR line `quantity` values, in commercial-UOM terms, exactly as today (Section 17.4 invariant 3).

### 19.6 Concurrency

Per Section 17.6's already-approved requirement, Goods Receipt V1 closes Purchase's concurrency gap relative to Sales' `ShipmentsService`:

- `preparePendingReceipt()` must take `SELECT ... FOR UPDATE` row locks on the `purchase_orders` row and all `purchase_order_items` rows for that order, inside its existing transaction — mirroring `ShipmentsService.preparePendingShipment()`.
- Locks must be taken in a **consistent order** (the parent `purchase_orders` row before its `purchase_order_items` rows, `purchase_order_items` locked by ascending `id`) to avoid introducing new deadlock risk between concurrent receipt-creation requests.
- A new `pendingQuantitiesByPurchaseOrderItem()` helper (mirroring `ShipmentsService.pendingQuantitiesByOrderItem()` exactly) must sum quantities already committed to other still-`PENDING_STOCK` Goods Receipts for the same PO item, and that sum must be subtracted from `remaining` alongside `receivedQuantity`, before a new receipt line is accepted — directly preventing the over-receipt race identified in Section 17.3/17.6.
- No schema change is required for this — purely a `goods-receipts.service.ts` logic change, symmetric with the existing Sales implementation.

### 19.7 Inventory Integration

- Only `baseQuantity` is ever sent to `InventoryStockClient.applyReceipt()` — never `quantity` (Section 17.4 invariant 7).
- The existing idempotency mechanism (`stock_receipt_applications`, keyed `(tenantId, referenceType, referenceId)`, payload-hash guarded) is preserved unchanged.
- Retry behavior: the `post()` retry path rebuilds Inventory lines from the persisted `baseQuantity` column, never recomputing `quantity × conversionFactor` again and never re-resolving `conversionFactor` (Section 17.4 invariant 5).
- `apps/inventory-service/**` is **not modified** in this phase — Inventory continues to receive base-UOM quantities only, exactly as today (Section 17.4 invariant 6).
- `apps/sales-service/**` is **not modified** in this phase — Sales' identical UOM gap (Section 17.7) remains explicitly out of scope for Purchase work.

### 19.8 Historical Snapshot Rules

Identical to Section 17.8: `productSku`, `productName`, `unitOfMeasureId`, `uomCode`, `uomName`, `conversionFactor` are copied verbatim from the parent `PurchaseOrderItem` at GR-line-creation time — never re-fetched from `Product`/`ProductUnit`/inventory-service. `baseQuantity` is a derived value (`quantity × conversionFactor`), computed once and stored for traceability/idempotency, not a snapshot.

### 19.9 Tenant Isolation and Authorization

- Every Goods Receipt query/mutation goes through `ActorGuard` → `@CurrentActor()` → explicit `tenantId` filtering in every Prisma query, and a `require()`-style tenant-scoped helper (cross-tenant access → 404), matching the repo-wide pattern (Section 1.6, Section 11).
- Existing Goods-Receipt-equivalent permissions are reused; no new permission constants are anticipated unless the pre-implementation reconciliation (§19.15) finds a genuine gap in the current `GoodsReceiptsController` routes.

### 19.10 Migration Strategy

Governed entirely by Section 17.9's already-approved non-destructive rules, restated here for Goods Receipt V1 specifically:

- Additive/non-destructive only: the eventual migration adds only new, nullable columns to `goods_receipt_items` (the Section 17.4 schema block) — no `DROP COLUMN`, no type narrowing, no new `NOT NULL` without a default.
- Existing Goods Receipts and Goods Receipt Items are preserved — never truncated, deleted, or reset (Section 17.9 rule 1; Section 17.10's explicit disavowal of the earlier one-time local `TRUNCATE` as a precedent applies here too).
- Backfill for any environment with pre-existing `goods_receipt_items` rows follows Section 17.9 rule 4 exactly: `conversionFactor = 1`, `baseQuantity = quantity` (the only truthful assumption, since Inventory has always received raw `quantity` to date), and `productSku`/`productName`/`unitOfMeasureId`/`uomCode` backfilled via a join to the parent `PurchaseOrderItem`.
- Historical `Stock`/`StockMovement` quantities in inventory-service are never retroactively modified — the backfill corrects only Purchase-side records, matching what Inventory already actually recorded.
- Already-applied migrations (`20260819120000_purchase_domain_v1`, `20260913183953_supplier_v1_details_and_addresses`, `20260913191233_purchase_order_v1_uom_discount_tax_snapshot`) are never edited or rewritten — any Goods Receipt V1 migration ships as a new migration file appended after them (Section 17.9 rule 5).

### 19.11 API Gateway Requirements

Mirror any new/changed `GoodsReceiptItem` response fields (`productSku`, `productName`, UOM snapshot, `conversionFactor`, `baseQuantity`) at `apps/api-gateway/src/purchase/dto/` response DTOs, matching the existing `PurchaseForwardService` generic-proxy pattern — no gateway route/permission changes are anticipated unless the pre-implementation reconciliation (§19.15) finds a gap.

### 19.12 Angular UI Requirements

The Goods Receipt UI should be structured as a proper business document, not a raw quantity-entry form, consistent with the PO V1/Section 18 document pattern:

1. **GR Header** — GR Number, Purchase Order reference, Supplier reference/snapshot, Warehouse, Receipt Date, Status, Notes.
2. **Receipt Lines** — Product (SKU/name), UOM, PO quantity, already-received quantity, remaining quantity, quantity being received (in commercial UOM), with the computed `baseQuantity` shown read-only/informational.
3. Clear labeling that the entered quantity is in the PO line's commercial UOM (e.g. "Receive (BOX)") to avoid user confusion about which unit is being entered — the UI must never ask the user to enter a base-UOM quantity directly.

### 19.13 Validation Requirements

- GR line quantity must be `> 0`.
- GR line quantity, combined with already-received and other in-flight `PENDING_STOCK` quantities, must not exceed the PO line's `quantity` (§19.5, §19.6).
- A GR may only reference PO items belonging to the referenced, same-tenant Purchase Order.
- A GR may only be created against a PO in a receivable status (`CONFIRMED`/`PARTIALLY_RECEIVED`).
- Per §19.4's new rule: an alternate-UOM PO line with a missing/invalid `conversionFactor` must reject GR-line creation rather than default to `1`.

### 19.14 Test Plan

New/extended Jest specs (hand-built plain-object Prisma/audit mocks, matching repo convention — Section 1.6, Section 13) must cover:

- Base UOM receipt (`conversionFactor = 1`) — `baseQuantity = quantity`.
- Alternate UOM receipt — `baseQuantity = quantity × conversionFactor`, matching Section 17.5's worked example.
- Partial receipt and multiple partial receipts, confirming `receivedQuantity` stays in commercial-UOM terms and PO status transitions correctly.
- Conversion-factor-changed-after-PO-creation scenario (Section 17.5) — a GR created after a master-data `ProductUnit.conversionFactor` edit must still use the factor frozen on the PO item.
- Retry (`post()`) using the already-stored `baseQuantity` — must not recompute or re-resolve `conversionFactor`.
- Concurrent receiving / over-receipt prevention — two concurrent `create()` calls against the same PO item must not together exceed the ordered quantity.
- Tenant isolation — cross-tenant access to a PO/GR returns 404.
- Idempotency — repeated `post()` retries against the same GR do not double-apply to Inventory.
- Regression coverage for existing GR behavior (creation, `PENDING_STOCK → POSTED` transition, `finalizePosted()` bookkeeping) to confirm nothing already-working is broken by the UOM change.

### 19.15 Implementation Status

Section 19 is **planning only**. No schema, migration, service, controller, Angular, or test code exists for it. Implementation requires its own explicit go-ahead, separate from this documentation update, and is the same body of work as Section 17 — Section 17 defines the target architecture, Section 19 defines the full document/API/UI/test plan around it. Before implementation, Claude must inspect the already-implemented PO V1/GR code and reconcile it against Sections 17 and 19, exactly as required for Section 18 (§18.9) — no existing implementation should be assumed correct merely because it is already present.

---

## 20. Sales Invoice — Completed / Existing Sales Reference

> **Status: COMPLETED AND VALIDATED (corrected 2026-09-14). Sales Invoice is already implemented and validated in `apps/sales-service/src/sales-invoices/` — it is NOT a future phase. An earlier version of this section incorrectly described it as a "future Sales-module roadmap item"; that was wrong and is corrected here (see Change History). This section documents existing, already-implemented behavior — confirmed by direct code read — for cross-module reference only (in particular, as the concrete precedent for the future Purchase Invoice phase, Section 22). Nothing in this section proposes new Sales Invoice work, and nothing here authorizes any change to `apps/sales-service/**`.**

### 20.1 Business Flow (Existing, Implemented)

`Sales Order → Sales Invoice`, and `Proforma Invoice → Sales Invoice` (via `sourceType`).

Sales Invoice sits inside the completed Sales flow: `Quotation → Proforma Invoice (optional) → Sales Order → Shipment → Sales Invoice → Customer Payment`.

### 20.2 Schema (`SalesInvoice`, `apps/sales-service/prisma/schema.prisma`)

- Header: `id, tenantId, invoiceNumber (unique per tenant), sourceType (SALES_ORDER|PROFORMA_INVOICE), sourceId, status (DRAFT|SENT|CANCELLED), customerId, customerName, billingAddress, shippingAddress, paymentTermId, salespersonId, invoiceDate, dueDate, notes, subtotal, discountTotal, taxTotal, total, amountPaid, paymentStatus (UNPAID|PARTIALLY_PAID|PAID), sentAt, createdAt, updatedAt`.
- `customerName`/`billingAddress`/`shippingAddress` are a frozen Customer snapshot taken at invoice-creation time — the same pattern already established for Purchase Order V1's supplier snapshot (Section 16).
- `paymentTermId`/`salespersonId` are soft cross-service/Identity references (`@db.Uuid`, no relation) — an explicit schema comment confirms this mirrors `Customer.paymentTermId`/`Customer.salespersonId`.
- `balanceDue` is intentionally **not** a persisted column — it is always computed as `total - amountPaid` (explicit schema comment) — a design detail worth carrying into the future Purchase Invoice/AP design (Section 22).
- Lines (`SalesInvoiceItem`): `productId, productSku, productName, quantity, unitOfMeasureId, uomCode, uomName, conversionFactor, unitPrice, discountPercent, discountAmount, taxCodeId, taxCode, taxCodeName, taxAmount, lineSubtotal, lineTotal` — the same product/UOM/tax snapshot shape already established for `PurchaseOrderItem`/`SalesOrderItem` (Section 17.8).
- Tax breakdown (`SalesInvoiceItemTaxComponent`): `sequence, type, name, rate, componentTaxAmount` — one row per applicable tax component on a line.
- Payments: see Section 21.2 (`SalesPayment`).

### 20.3 Calculation (Already Implemented, Server-Authoritative)

Confirmed by direct code read of `sales-invoices.service.ts`: totals are computed server-side using the same convention already documented for Purchase Order V1 (Section 18.5) — `gross = quantity × unitPrice`, `discountAmount = gross × discountPercent / 100`, `lineSubtotal = gross - discountAmount`, each tax component rounded independently, `lineTotal = lineSubtotal + taxAmount`, document totals summed from the already-rounded line values.

### 20.4 Lifecycle / Status Rules (Implemented, Confirmed by Code Read)

- `create()` — builds a DRAFT invoice, either standalone, from a Sales Order (`createFromSalesOrder()`), or from a Proforma Invoice (`createFromProformaInvoice()`).
- `update()` — only permitted while `status = DRAFT` (`ConflictException` otherwise).
- `send()` — only permitted from `DRAFT`, requires at least one line item; transitions to `SENT`, sets `sentAt`. A zero-total invoice is marked `PAID` immediately on send, since its balance due is already zero; a non-zero-total invoice starts `UNPAID`.
- `cancel()` — only permitted from `DRAFT` or `SENT`; explicitly **rejected** if the invoice has any recorded payments (`amountPaid > 0`) — cancellation of a paid/partially-paid invoice is not allowed.
- No hard-delete route exists — consistent with the repo-wide "no hard delete on documents" convention (Section 1.6).

### 20.5 Accounting Boundary (Implemented, Confirmed by Code Comment)

`sales-invoices.service.ts` contains an explicit, already-implemented boundary — quoting the code comment directly: *"Sales must not write accounting journals itself... This publishes the integration point event only; accounting-service has no consumer/ledger yet to actually post the entry (documented limitation)."* `send()` publishes an invoice-posted integration event, but no actual General Ledger/journal entry is created. This is the same operational-vs-accounting boundary this plan has applied to Purchase (Section 1.6, Section 16), now confirmed to already be Sales' own implemented convention, not merely a Purchase-side aspiration.

### 20.6 Currency

Sales Invoice, as implemented, carries no currency/exchange-rate field — consistent with this plan's currency-deferred stance (Section 18.3) for Purchase; no currency work is proposed here for either module.

### 20.7 Reference Value for Purchase Invoice (Section 22)

Sales Invoice's already-validated design — frozen customer/product/UOM/tax snapshots, server-authoritative totals, `amountPaid`-driven `paymentStatus`, a non-persisted computed `balanceDue`, cancellation blocked once any payment exists, and an explicit "no accounting posting from this service" boundary — is the concrete precedent the future Purchase Invoice/AP phase (Section 22) is expected to mirror once separately approved and designed. Nothing here designs Purchase Invoice itself.

### 20.8 Scope Boundary

Section 20 is reference documentation of **completed** Sales functionality. No Sales Invoice implementation work is proposed, planned, or authorized by this document. This documentation update makes no change to `apps/sales-service/**`.

---

## 21. Sales Payment — Completed / Existing Sales Reference

> **Status: COMPLETED AND VALIDATED (corrected 2026-09-14). Sales Payment is already implemented and validated in `apps/sales-service/src/sales-invoices/` (as the `SalesPayment` child resource of `SalesInvoice`) — it is NOT a future phase. An earlier version of this section incorrectly described it as a "future Sales-module roadmap item"; that was wrong and is corrected here (see Change History). This section documents existing, already-implemented behavior — confirmed by direct code read — for cross-module reference only (in particular, as the concrete precedent for the future Supplier Payment phase, Section 22). Nothing in this section proposes new Sales Payment work, and nothing here authorizes any change to `apps/sales-service/**`.**

### 21.1 Business Flow (Existing, Implemented)

`Sales Invoice → Customer Payment` — implemented as `SalesPayment`, a child resource of `SalesInvoice` (`POST/GET /v1/sales-invoices/:id/payments`), not a standalone top-level document.

### 21.2 Schema (`SalesPayment`, `apps/sales-service/prisma/schema.prisma`)

`id, tenantId, salesInvoiceId, amount, paymentDate, paymentMethodId, reference, notes, createdAt, updatedAt`. `paymentMethodId` is a soft Master-Data reference (`@db.Uuid`, no relation) — an explicit schema comment confirms this mirrors `SalesInvoice.paymentTermId`. `salesInvoiceId` is a real in-DB FK (`onDelete: Cascade`).

### 21.3 Recording Behavior (Implemented, Confirmed by Code Read)

`recordPayment()` in `sales-invoices.service.ts`:

- Rejects a zero/negative amount.
- Locks the `SalesInvoice` row `FOR UPDATE` inside the transaction (mirroring `ShipmentsService.finalizePosted()`'s locking pattern, per the method's own doc comment), so the balance check and the `amountPaid`/`paymentStatus` update happen against one serialized read.
- Only accepted against a `SENT` invoice (`ConflictException` for `DRAFT`/`CANCELLED`).
- Rejected if the invoice's `paymentStatus` is already `PAID`.
- Rejected if `amount` exceeds `balanceDue` (`total - amountPaid`) — over-allocation is not permitted.
- On success: creates the `SalesPayment` row, increments `amountPaid`, and recomputes `paymentStatus` (`PARTIALLY_PAID` while `amountPaid < total`, `PAID` once `amountPaid >= total`).
- Partial payments and multiple payments accumulating against one invoice are both supported by this accumulation logic — a full payment is simply the case where a single (or final) payment brings `amountPaid` to `total`.

### 21.4 Cancellation / Reversal (Current, Implemented State)

As implemented today, there is **no** payment cancellation/reversal endpoint — `sales-invoices.controller.ts` exposes only `POST .../payments` and `GET .../payments`, so a recorded `SalesPayment` cannot currently be reversed via the API. This is documented here as the accurate current state, not as a gap this document is proposing to fix. Any future payment-reversal capability would be a separately scoped Sales-module change, outside this Purchase-module document.

### 21.5 Accounting Boundary

Recording a `SalesPayment` updates only the invoice's operational `amountPaid`/`paymentStatus` fields — it does not post any accounting/journal entry (no such integration exists yet, consistent with Section 20.5's confirmed "Sales must not write accounting journals itself" boundary).

### 21.6 Currency

No currency/exchange-rate field exists on `SalesPayment` as implemented — consistent with this plan's currency-deferred stance; no currency work is proposed here.

### 21.7 Reference Value for Supplier Payment (Section 22)

Sales Payment's already-validated design — row-locked balance check, `SENT`-only/not-already-`PAID` gating, strict over-allocation rejection, and accumulation-based partial/full payment support with no implicit accounting posting — is the concrete precedent the future Supplier Payment phase (Section 22) is expected to mirror once separately approved and designed. Nothing here designs Supplier Payment itself.

### 21.8 Scope Boundary

Section 21 is reference documentation of **completed** Sales functionality. No Sales Payment implementation work is proposed, planned, or authorized by this document. This documentation update makes no change to `apps/sales-service/**`.

---

## 22. Purchase Invoice / Supplier Payment / Accounts Payable — Future Architecture Plan (Phases A–C, Not Implemented)

> **Status: HIGH-LEVEL FUTURE ARCHITECTURE — EXPANDED FOR PLANNING (2026-09-14, expanded from the prior brief roadmap). Purchase Invoice, Supplier Payment, and Accounts Payable/Accounting Integration are NOT implemented anywhere in this repository — no schema, migration, DTO, service, controller, Angular, or test code exists for any of them. This section exists so a future Claude session can prepare an implementation plan without rediscovering the architecture from scratch; it is not itself an implementation plan and does not authorize any code, schema, or migration work. Organized into three sequential phases — PHASE A (Purchase Invoice V1), PHASE B (Supplier Payment V1), PHASE C (Accounts Payable / Accounting Integration) — each requiring its own separate, explicit implementation go-ahead. Sales Invoice/Sales Payment (Sections 20–21) are used throughout as the primary reference for already-proven operational-document behavior, adapted for Purchase rather than copied verbatim; Purchase-specific relationships (PO/GR references, three-way matching) have no Sales precedent and are marked accordingly.**

### 22.1 Overview and Phase Breakdown

- **PHASE A — Purchase Invoice V1** (§22.2–§22.8): an operational billing document capturing what the supplier has invoiced, referencing the originating PO/GR(s), with server-authoritative totals mirroring the already-implemented Purchase Order/Sales Invoice calculation convention. No AP ledger, no accounting journal posting.
- **PHASE B — Supplier Payment V1** (§22.9–§22.10): recording payments against a Purchase Invoice's balance, mirroring Sales Payment's already-validated design (Section 21). Operational only — updates invoice balance/status, nothing else.
- **PHASE C — Accounts Payable / Accounting Integration** (§22.12): the ledger-level integration connecting Purchase Invoice/Supplier Payment operational records to real AP tracking (payable balances, aging) and General Ledger journal posting. Requires its own separate, dedicated architecture review — the current Accounting service does not yet provide a complete AP model/workflow, unlike the accounting boundary Sales Invoice/Payment already navigate successfully by simply *not* posting journals yet (Section 20.5, Section 21.5).

**Dependency order**: Phase A depends on Goods Receipt V1 (Section 19) being implemented or at minimum stable, since Purchase Invoice lines reference GR/PO data (§22.4). Phase B depends on Phase A (a payment needs an invoice to pay against). Phase C depends on both A and B existing operationally, plus its own separate review — it is not assumed to follow automatically. See §22.19 for the full proposed sequencing, which also folds in Section 19 and currency.

### 22.2 Purchase Invoice Business Flow — PHASE A

Intended flow: `Purchase Order → Goods Receipt → Purchase Invoice → Supplier Payment`.

How Purchase Invoice is expected to relate to each surrounding concept:

- **Supplier** — every Purchase Invoice belongs to exactly one Supplier (`supplierId`), mirroring `PurchaseOrder.supplierId` and `SalesInvoice.customerId`. Proposed, low-risk — matches every existing document pattern in this repo.
- **Purchase Order** — a Purchase Invoice is expected to reference the originating PO(s) it bills against, for traceability and three-way matching (§22.4). **Proposed default: one Purchase Invoice references exactly one Purchase Order** (`purchaseOrderId`), mirroring `SalesInvoice.sourceType/sourceId` pointing at exactly one `SalesOrder`/`ProformaInvoice` (Section 20.2). Whether one invoice may span **multiple** POs is **not decided** — some real-world supplier billing consolidates multiple POs onto one invoice, but no existing document in this repo does that (Sales Invoice always has exactly one source), so multi-PO invoicing would be a genuine architectural departure requiring its own explicit review before design, not something assumed by default.
- **Goods Receipt** — a Purchase Invoice is expected to reference the GR(s) whose received quantity it bills against, for three-way matching. **Proposed: an invoice line may reference one GR item** (`goodsReceiptItemId`, alongside `purchaseOrderItemId`), and an invoice as a whole may span **multiple GRs under the same PO** — this follows directly from the already-approved partial-receipt architecture (Section 17.5's "multiple partial receipts" example: a PO line can be received across several GRs, so an invoice billing that PO line legitimately may need to reference more than one GR item). This is treated as settled, not an open question, because it falls out of already-approved Section 17/19 behavior rather than introducing anything new.
- **Supplier invoice/reference number** — the supplier's own external invoice number, captured as free text (proposed field name `supplierInvoiceNumber`), distinct from this system's own generated `invoiceNumber`. This is the Purchase-side equivalent of the "Supplier Reference" field Section 18.2 already proposed at the PO level (still unimplemented there too) — the two are conceptually related but not the same field; a PO's Supplier Reference is the supplier's quote/reference at order time, a Purchase Invoice's supplier invoice number is the supplier's bill reference at invoice time.
- **Supplier Payment** — a Purchase Invoice carries a payable balance (`amountPaid`, computed `balanceDue`, `paymentStatus`, §22.3) updated by Supplier Payment (Phase B), not computed by the invoice itself — mirroring Sales Invoice/Sales Payment's relationship exactly (Section 20.2, Section 21.3).

**Proposed vs. requiring later approval:**

| Relationship | Status |
|---|---|
| One Purchase Invoice → one Supplier | Proposed, low-risk, matches every existing document pattern |
| One Purchase Invoice → one Purchase Order | Proposed default, mirrors Sales Invoice's single-source pattern |
| One Purchase Invoice → multiple Purchase Orders | **Not decided** — no precedent in this repo; requires a separate business/architecture decision before design |
| One Purchase Invoice → one or more Goods Receipts under the same PO | Proposed, follows directly from the already-approved partial-receipt architecture (Section 17.5) |
| One Goods Receipt → multiple Purchase Invoices (partial invoicing of a single receipt) | **Not decided** — plausible, but not assumed without explicit business confirmation |

No final many-to-many schema is proposed; this table exists so a future session does not have to rediscover which relationships are settled versus open.

### 22.3 Purchase Invoice Header — PHASE A

Proposed fields, using Sales Invoice's schema (Section 20.2) as the primary structural reference, adapted for Purchase:

| Field | Status | Notes |
|---|---|---|
| `id`, `tenantId` | Proposed, settled | Standard. |
| `invoiceNumber` | Proposed, settled | System-generated, tenant-scoped, unique-per-tenant business document number — mirrors `SalesInvoice.invoiceNumber` and PO Number (Section 18.2). |
| `supplierInvoiceNumber` | Proposed, settled | The supplier's own external reference (§22.2) — free text, optional. Purchase has no Sales precedent for this field since Sales Invoice is the *outgoing* document (no external reference needed); it exists because Purchase Invoice is the *incoming* billing document. |
| `purchaseOrderId` | Proposed default (§22.2) | Mirrors `SalesInvoice.sourceId`, but named directly rather than via a generic `sourceType`/`sourceId` pair, since Purchase Invoice (per the proposed default) has exactly one source-document type (PO), unlike Sales Invoice which can originate from either a Sales Order or a Proforma Invoice. |
| `status` | Proposed, names not final (§22.8) | See §22.8 for the full lifecycle discussion. |
| `supplierId` | Proposed, settled | Real reference to `Supplier`. |
| `supplierName`, `supplierGstin`, `supplierBillingAddress` | Proposed, settled | Frozen supplier snapshot, directly mirroring `PurchaseOrder.supplierName/supplierGstin/supplierBillingAddress` (already-implemented PO V1 fields) and `SalesInvoice.customerName/billingAddress` (Section 20.2). Supplier Dispatch Address is **not** proposed here — it describes where the supplier ships *from*, which is irrelevant to a billing document (unlike the PO, which needs it as informational context for the order). |
| `paymentTermId` | Proposed, settled | Soft Master-Data reference, mirrors `PurchaseOrder.paymentTermId`/`SalesInvoice.paymentTermId`. |
| `invoiceDate` | Proposed, settled | Mirrors `SalesInvoice.invoiceDate`. |
| `dueDate` | Proposed, settled | Mirrors `SalesInvoice.dueDate` — nullable, optionally derived from `paymentTermId`. |
| `notes` | Proposed, settled | Free text. |
| `subtotal`, `discountTotal`, `taxTotal`, `total` | Proposed, settled | Server-computed (§22.6), mirrors `SalesInvoice`/`PurchaseOrder`. |
| `amountPaid` | Proposed, settled | Accumulated from Supplier Payment (Phase B), mirrors `SalesInvoice.amountPaid`. |
| `balanceDue` | Proposed, settled | **Not a persisted column** — always computed as `total - amountPaid`, mirroring `SalesInvoice`'s explicit schema-comment convention (Section 20.2) exactly. |
| `paymentStatus` | Proposed, names not final | Mirrors `SalesInvoicePaymentStatus` (`UNPAID`/`PARTIALLY_PAID`/`PAID`) conceptually; exact enum name (e.g. `PurchaseInvoicePaymentStatus`) not decided, just the shape. |
| `createdAt`, `updatedAt` | Proposed, settled | Standard. |

**No `salespersonId`/buyer field is proposed on the invoice itself** — if a Buyer/Purchaser field is eventually added at the PO level (Section 18.2, still unimplemented), the invoice can reference it transitively via the PO rather than duplicating it; this avoids inventing a redundant field ahead of Section 18's own implementation.

**Currency/exchange-rate fields are explicitly NOT proposed** (§22.13).

### 22.4 Purchase Invoice Lines — PHASE A

Proposed fields, using `SalesInvoiceItem` (Section 20.2) and `PurchaseOrderItem`/`GoodsReceiptItem` (as specified in Section 19) as the structural references:

| Field | Status | Notes |
|---|---|---|
| `purchaseOrderItemId` | Proposed, settled | Reference to the PO line being invoiced — required, enables three-way matching against `PurchaseOrderItem.quantity`. |
| `goodsReceiptItemId` | Proposed, settled | Reference to the specific GR line being invoiced, where invoicing is tied to a specific receipt (§22.2). Nullable if the eventual design allows invoicing directly against a PO line without requiring a specific GR reference — **not decided** whether a GR reference should be mandatory; see the matching-rules discussion in §22.5. |
| `productId`, `productSku`, `productName` | Proposed, settled | Frozen snapshot, mirrors `PurchaseOrderItem`/`SalesInvoiceItem`. |
| `unitOfMeasureId`, `uomCode`, `uomName`, `conversionFactor` | Proposed, settled | Frozen UOM snapshot, mirrors `PurchaseOrderItem`/`SalesInvoiceItem`/the Section 19 `GoodsReceiptItem` design — copied from the GR line (or PO line if no GR reference) at invoice-creation time, never re-resolved, consistent with Section 17.4 invariant 5's "never re-resolve historical conversion factor" rule. |
| `quantity` | Proposed, settled | The **invoiced** quantity, in the same commercial UOM as the PO/GR line (Section 17.4 invariant 1/2 pattern extended to invoicing) — never a base-UOM quantity. |
| `unitCost` | Proposed, settled | Mirrors `PurchaseOrderItem.unitCost`. May differ from the PO's `unitCost` if the supplier bills a different price — this discrepancy is exactly what cost-mismatch matching (§22.5) is for, not something to silently reconcile. |
| `discountPercent`, `discountAmount` | Proposed, settled | Mirrors `PurchaseOrderItem`/`SalesInvoiceItem` percentage-only discount convention (Section 16 PO invariant). |
| `taxCodeId`, `taxCode`, `taxCodeName`, `taxAmount` | Proposed, settled | Mirrors `PurchaseOrderItem`/`SalesInvoiceItem`. |
| `lineSubtotal`, `lineTotal` | Proposed, settled | Server-computed (§22.6). |
| Tax component child rows (`PurchaseInvoiceItemTaxComponent`-equivalent) | Proposed, settled | Mirrors `PurchaseOrderItemTaxComponent`/`SalesInvoiceItemTaxComponent` exactly — `sequence, type, name, rate, componentTaxAmount`. |

**Invoiced quantity vs. ordered vs. received quantity**: the intended relationship is `invoicedQuantity ≤ receivedQuantity ≤ orderedQuantity` for a given PO line, accumulated the same way `PurchaseOrderItem.receivedQuantity` already accumulates from GR lines (Section 17.4 invariant 3) — a new `PurchaseOrderItem.invoicedQuantity` column is the proposed mechanism (§22.5), accumulating from Purchase Invoice lines in the same commercial UOM, never mixed with base-UOM values, exactly matching the existing `receivedQuantity` pattern.

### 22.5 Three-Way Matching — PHASE A

Intended relationship:
```
Purchase Order
      ↕
Goods Receipt
      ↕
Purchase Invoice
```

**Purpose of matching**: before a Purchase Invoice is trusted enough to move toward payment, the system should be able to compare — per PO line — what was **ordered**, what was **received**, and what is being **invoiced**, plus the **cost**, **tax**, and **discount** implied by each stage, so a genuine discrepancy (wrong quantity billed, wrong price billed) is surfaced rather than silently accepted.

**Proposed rules for detecting mismatches** (rules themselves proposed; tolerance values explicitly not decided — see below):

- **Invoicing above received quantity**: `invoicedQuantity` (existing + this invoice's line) must not exceed `receivedQuantity` for that PO line. Proposed as a **hard block** by default (an invoice cannot bill more than was physically received) — mirrors the same spirit as Section 17.4 invariant 3's commercial-UOM accumulation discipline, applied one stage further down the chain.
- **Invoicing above ordered quantity**: `invoicedQuantity` must not exceed `orderedQuantity` (`PurchaseOrderItem.quantity`) — this is implied by the previous rule as long as `receivedQuantity ≤ orderedQuantity` already holds (Section 17's over-receipt prevention, Section 19.6), but is worth stating as its own explicit check for defense-in-depth in case that invariant is ever violated elsewhere.
- **Cost mismatch**: comparing the invoice line's `unitCost` against the PO line's `unitCost`. **Proposed**: flag/warn rather than hard-block by default, since suppliers legitimately bill different prices for valid reasons (price changes, negotiated adjustments) — but whether this should be a warning, a required-approval step, or a hard block **is a future business decision**, not decided here.
- **Tax mismatch**: comparing the invoice line's resolved tax code/amount against the PO line's — same proposed treatment as cost mismatch (flag by default, exact policy undecided).
- **Discount mismatch**: same treatment as cost/tax mismatch.

**Tolerance policy is explicitly NOT invented here.** No percentage or absolute tolerance threshold (e.g. "flag if cost differs by more than 2%") is proposed — this is marked as a **future business decision**, to be made by whoever owns Purchase/Finance policy, not assumed by Claude. Until that decision is made, the safest default (if Phase A is implemented before the tolerance policy is settled) is: **exact-match required for quantity (hard block on over-invoicing), flag-only for cost/tax/discount with zero built-in tolerance** (i.e. any difference at all is flagged, deferring to a human) — this is the most conservative starting point, not a final design decision.

### 22.6 Purchase Invoice Calculation — PHASE A

Identical, server-authoritative calculation convention to Purchase Order V1 (Section 18.5) and Sales Invoice (Section 20.3) — restated here for Purchase Invoice completeness, not a new formula:

```
gross            = quantity × unitCost
discountAmount   = gross × discountPercent / 100
lineSubtotal     = gross - discountAmount
```

Each tax component is calculated independently and rounded per the established 4-decimal HALF_UP convention (matching every other document type in this repo).

```
lineTotal = lineSubtotal + taxAmount
```

Document totals (`subtotal`, `discountTotal`, `taxTotal`, `total`/`grandTotal`) are summed from the already-rounded line values, exactly as Section 18.5/Section 20.3 already establish.

**All calculations must remain server-authoritative — client-supplied totals must never be trusted**, identical to the already-implemented PO V1 rule (Section 16 PO invariant) and Sales Invoice's implemented behavior (Section 20.3).

### 22.7 Purchase Invoice Snapshots — PHASE A

Historical information to be frozen at invoice-creation time (using Purchase Order's already-implemented snapshot pattern, Section 16, and Sales Invoice's implemented pattern, Section 20.2/20.7/Section 17.8, as direct precedent):

| Snapshotted field | Copied from | Why |
|---|---|---|
| `supplierName`, `supplierGstin`, `supplierBillingAddress` | `Supplier`/`PurchaseOrder` (proposed: copied from the referenced `PurchaseOrder`'s own already-frozen snapshot, not re-fetched from live `Supplier` data) | Consistent with the "never re-derive from current master data" rule already governing PO snapshots (Section 16) and GR snapshots (Section 17.4 invariant 5) — an invoice created against an old PO should reflect the supplier as it was *at PO time*, not whatever the supplier record says today. |
| Supplier dispatch/address information | **Not proposed** on the invoice (§22.3) | A billing document has no operational need for the supplier's shipping-origin address; including it would be scope creep beyond what Sales Invoice does for its Sales equivalent (Sales Invoice also omits a "dispatch address" concept). |
| `productId`, `productSku`, `productName` | The referenced `PurchaseOrderItem`/`GoodsReceiptItem` (per Section 19's eventual snapshot, never re-fetched from `Product`) | Matches Section 17.8's "why" column exactly — a receipt/invoice row should be self-describing without a join, and immune to later product-master edits. |
| `unitOfMeasureId`, `uomCode`, `uomName`, `conversionFactor` | Same as above | Same reasoning as Section 17.4 invariant 5 — the conversion factor used for an invoice must be the one that was in effect at PO/GR time, never re-resolved live. |
| `taxCodeId`, `taxCode`, `taxCodeName` | Resolved at invoice-creation time via the existing `AccountingTaxCodeClient` (already reused as-is, never modified, Section 16 PO invariant) — or copied forward from the PO/GR line if the design ultimately prefers strict lineage over re-resolution | **Not fully decided**: whether tax should be re-resolved at invoice time (since tax rates can legitimately change between order and invoice) or copied forward from the PO line (for strict traceability) is a genuine open design question, unlike the UOM conversion factor question (§22.4/Section 17.4 invariant 5), which is already settled in favor of never re-resolving. Flagged here rather than silently assumed either way. |
| Commercial values (`unitCost`, `discountPercent`, computed amounts) | Entered/computed at invoice-creation time, not copied from the PO (since the invoice's commercial values are, by definition, what the supplier actually billed — see §22.5's cost-mismatch discussion) | The invoice's own commercial values are the billed values, which may legitimately differ from the PO's ordered values; that difference is the entire point of three-way matching. |

**When snapshots are created / become immutable**: proposed to mirror the already-implemented PO V1/Sales Invoice pattern exactly — snapshots are taken at invoice creation; while the invoice is DRAFT, changing the referenced PO/supplier may refresh the snapshot (mirroring Section 18.6's PO DRAFT-refresh rule); once the invoice leaves DRAFT (§22.8), all snapshots become immutable, identical to Section 16's PO invariant and Section 20.8's snapshot-immutability rule for Sales Invoice.

### 22.8 Purchase Invoice Status / Lifecycle — PHASE A

**Proposed lifecycle, using Sales Invoice's implemented lifecycle (Section 20.4) as a starting shape, not copied blindly:**

| Proposed status | Purpose | Notes |
|---|---|---|
| `DRAFT` | Invoice is being entered/edited, not yet finalized | Mirrors `SalesInvoiceStatus.DRAFT`. Editable — matching lines can be added/changed/removed while DRAFT, mirroring `SalesInvoicesService.update()`'s DRAFT-only restriction (Section 20.4). |
| `POSTED` (name not final — Sales calls its equivalent transition `SENT`, which doesn't read naturally for an *incoming* supplier bill) | Invoice is finalized, ready to be tracked toward payment | The exact name (`POSTED`, `CONFIRMED`, `APPROVED`, `ISSUED`) is **not decided** — `SENT` is deliberately not proposed verbatim, since Purchase Invoice is not "sent" anywhere (it's received/recorded), unlike Sales Invoice which literally is sent to a customer. Whatever name is chosen, the transition rule proposed is the same as Sales Invoice's `send()`: requires at least one line item, locks the invoice from further editing, sets a corresponding timestamp. |
| `CANCELLED` | Invoice cancelled | Mirrors `SalesInvoiceStatus.CANCELLED` — proposed to reuse Sales Invoice's implemented cancellation rule exactly: only permitted from `DRAFT` or the finalized state, and **rejected if any payment has been recorded** (`amountPaid > 0`), identical to `SalesInvoicesService.cancel()` (Section 20.4). |

**Explicitly flagged as requiring later business approval, not assumed:**
- Whether an "approval" step is needed between DRAFT and the finalized state (e.g. a separate approver reviewing three-way-matching flags from §22.5 before the invoice can be finalized) — Sales Invoice has no equivalent approval gate, so this would be new, Purchase-specific behavior, not a copy of anything existing.
- The exact finalized-state name (see table above).
- Whether `PARTIALLY_PAID`/`PAID` should be sub-states of the finalized status, or tracked purely via the separate `paymentStatus` field (as Sales Invoice already does, Section 20.2/20.4) — **proposed default: follow Sales Invoice's approach exactly** (`status` and `paymentStatus` are two independent fields; a `POSTED` invoice can be `UNPAID`, `PARTIALLY_PAID`, or `PAID`, and only `status` changing to `CANCELLED` is gated on `amountPaid`), since this is a proven, already-implemented pattern with no reason to deviate.

**Payment restrictions**: proposed to mirror `SalesInvoicesService.recordPayment()` exactly (Section 21.3) — payments only accepted against the finalized (non-DRAFT, non-CANCELLED) status, rejected once `paymentStatus = PAID`, rejected if the amount would exceed `balanceDue`.

### 22.9 Supplier Payment V1 — PHASE B

Detailed future plan, using the already-implemented `SalesPayment`/`recordPayment()` (Section 21.2/21.3) as the concrete, line-by-line reference:

- **Payment as a child resource vs. standalone document**: **proposed: child resource of Purchase Invoice** (`POST/GET /v1/purchase-invoices/:id/payments`), exactly mirroring `SalesPayment`'s implemented shape (`salesInvoiceId` FK, nested routes under `sales-invoices`) — not a standalone top-level document. This is the single most directly-reusable piece of Sales Payment's design, since nothing about it is Sales-specific.
- **Schema** (proposed, mirrors `SalesPayment` field-for-field): `id, tenantId, purchaseInvoiceId, amount, paymentDate, paymentMethodId, reference, notes, createdAt, updatedAt`. `purchaseInvoiceId` a real in-DB FK (`onDelete: Cascade`, mirroring `SalesPayment.salesInvoiceId`).
- **Payment amount**: rejects zero/negative, mirrors `recordPayment()`'s first check exactly (Section 21.3).
- **Payment date**: required, mirrors `SalesPayment.paymentDate`.
- **Payment method**: soft Master-Data reference (`paymentMethodId`), see §22.10.
- **Reference / notes**: optional free text, mirrors `SalesPayment.reference`/`notes`.
- **Invoice allocation**: proposed to mirror `recordPayment()`'s transaction exactly — lock the `PurchaseInvoice` row `FOR UPDATE` inside the transaction (mirroring both `SalesInvoicesService.recordPayment()`'s locking pattern, Section 21.3, and `ShipmentsService`/Section 19.6's row-locking precedent), so the balance check and the `amountPaid`/`paymentStatus` update happen against one serialized read.
- **Partial payment / multiple payments / full payment**: proposed to mirror `recordPayment()`'s accumulation logic exactly — `amountPaid` accumulates across payments; `paymentStatus` becomes `PARTIALLY_PAID` while `amountPaid < total`, `PAID` once `amountPaid >= total`; a "full payment" is simply the case where accumulation reaches `total`, not a separate code path (Section 21.3).
- **Balance due**: computed, not persisted (`total - amountPaid`), mirroring `SalesInvoice.balanceDue`'s design exactly (Section 20.2).
- **Overpayment prevention**: proposed hard rejection if `amount > balanceDue`, mirroring `recordPayment()`'s existing check exactly (Section 21.3) — no "unallocated credit" concept is proposed, matching Sales Payment's current implemented behavior (which also has no such concept, per Section 21.3).
- **Row locking / concurrency**: as above — `SELECT ... FOR UPDATE` on the parent invoice, inside the same transaction as the payment insert and the invoice update, exactly matching `recordPayment()`'s implemented pattern.
- **Tenant isolation**: `ActorGuard`/`@CurrentActor()`/explicit `tenantId` filtering on every query, `require()`-style helper (cross-tenant → 404) — the universal repo pattern (§22.14).
- **Payment status updates**: as described above, driven purely by the accumulation logic, no separate manual status-setting endpoint proposed.

**Payment reversal/cancellation is explicitly NOT proposed** at this stage, matching Sales Payment's own current implemented state: as documented in Section 21.4, Sales Payment has **no** payment cancellation/reversal endpoint today. Supplier Payment V1 is proposed to match that exactly — no reversal capability in the initial version. If reversal is needed later, it is marked here as a **separate future capability**, requiring its own design (for both Supplier Payment and, symmetrically, Sales Payment — see Section 21.4's own note that any future reversal work is a separately scoped Sales-module change).

### 22.10 Payment Methods — PHASE B

Proposed: **reuse the existing Master Data Payment Method concept exactly as Sales Payment already does** (Section 21.2) — `paymentMethodId` as a soft cross-service/master-data reference (`@db.Uuid`, no Prisma relation, `@IsUUID()` DTO validation only, no synchronous existence-check HTTP call), mirroring the repo-wide soft-reference convention (Section 1.6) and `SalesPayment.paymentMethodId`'s own explicit schema comment ("mirrors `SalesInvoice.paymentTermId`").

**No duplicate Purchase-specific payment-method master is proposed.** There is exactly one Payment Method concept in this system, shared by both Sales and Purchase, consistent with how `paymentTermId` is already shared across `Supplier`, `PurchaseOrder`, `Customer`, and `SalesInvoice`.

### 22.11 Accounting Boundary — PHASE A & B

Stated explicitly, mirroring Sales Invoice/Sales Payment's own already-implemented, code-comment-confirmed boundary (Section 20.5, Section 21.5) as direct precedent:

- **Purchase Invoice** (Phase A) may initially be an operational Purchase-module record only — it must **not** directly create accounting journal entries unless a separate, explicitly approved Accounting Integration phase (Phase C, §22.12) exists.
  ```
  Purchase Invoice → operational payable information → future AP/Accounting integration
  ```
- **Supplier Payment** (Phase B) may initially update operational payment-allocation state only — it must **not** directly create accounting journal entries either.
  ```
  Supplier Payment → operational payment allocation → future AP/Accounting integration
  ```
- If Phase A eventually needs an integration-point event (comparable to Sales Invoice's `send()` publishing an invoice-posted event with no consumer yet, per the exact code comment quoted in Section 20.5: *"Sales must not write accounting journals itself... This publishes the integration point event only; accounting-service has no consumer/ledger yet to actually post the entry"*), the same pattern is proposed here — publish an event, do not assume anything consumes it yet.
- This boundary is not a Purchase-specific invention; it is confirmed to already be Sales' own working convention (Section 20.5), which is exactly why it is safe to carry forward as the Purchase precedent rather than a hypothetical.

### 22.12 Accounts Payable Future Phase — PHASE C

Expanded roadmap-level (not implementation-level) coverage of the eventual AP architecture:

- **Supplier payable balance** — the aggregate amount owed to a given supplier across all their unpaid/partially-paid Purchase Invoices; conceptually the AP-side mirror of an eventual AR (Accounts Receivable) balance for Sales, which itself does not yet exist as a first-class concept either (Sales Invoice tracks `balanceDue` per-invoice, not an aggregate AR balance per-customer) — so this would be genuinely new ground for the repo, not a proven pattern to copy.
- **Outstanding invoices** — a supplier-scoped view of unpaid/partially-paid Purchase Invoices, likely derived from existing `PurchaseInvoice.paymentStatus`/`balanceDue` rather than a separate persisted structure, but not decided.
- **Payment allocation** — already covered operationally by Supplier Payment (Phase B, §22.9); Phase C's concern is whether/how this needs to roll up into ledger-level payable tracking.
- **Aging** — bucketing outstanding payable balance by how overdue it is (e.g. current / 30 / 60 / 90+ days past `dueDate`) — a reporting/analysis concept, not something that changes the transactional schema; entirely undesigned here.
- **Credit/debit adjustments, if eventually required** — e.g. a supplier credit note reducing a payable balance without a cash payment. Not modeled here at all; flagged only as a plausible future need, since Sales has no equivalent implemented today either (no `SalesCreditNote` exists in this repo).
- **Accounting journal integration** — the actual General Ledger posting (debit expense/inventory, credit AP; debit AP, credit cash on payment) — this is the core of what makes this "Accounting Integration" rather than "AP bookkeeping inside Purchase," and is exactly the piece Section 20.5/Section 21.5 confirm Sales does **not** yet do either.
- **Payable account** — which GL account code a given supplier/transaction posts against — an Accounting-service master-data concept that doesn't yet exist in a form Purchase could safely integrate with (mirrors the already-stated reason, §22.4-legacy/below, that Accounting doesn't yet provide a complete AP model).
- **Reconciliation** — matching AP ledger balances against actual bank/payment records — a Phase-C-or-later concern, not modeled here.

**No final database schema is proposed for any of the above** — this is intentionally roadmap-level only. **This entire phase is marked as requiring its own separate, dedicated architecture review**, not something Phase A/B's implementation can casually grow into — the current Accounting service does not yet provide a complete AP model/workflow (journal posting, ledger accounts, payable tracking), so responsible design here is blocked on that gap closing or an explicit interim design being reviewed and approved first. This is the one remaining genuine architectural gap in the Purchase document chain, since Sales' equivalent operational patterns (Sections 20–21) are already proven and available as precedent for Phases A and B.

### 22.13 Currency

Currency and multi-currency remain **explicitly deferred**, identical to every other section of this document (Section 18.3, Section 20.6, Section 21.6). Purchase Invoice and Supplier Payment must **not** gain:
- a currency field,
- an exchange-rate field,
- currency-conversion logic, or
- multi-currency totals,

at this stage, regardless of how the rest of §22.2–§22.12 is eventually implemented. This applies to Phases A, B, and C alike — Phase C in particular might seem like a natural place to "finally" add currency since it touches accounting, but that is explicitly not authorized here; currency remains its own, separately reviewed future phase, likely spanning both Purchase and Sales together with Accounting (Section 23).

### 22.14 Tenancy / Authorization

Future Purchase Invoice and Supplier Payment must follow the repo-wide, already-mandatory pattern (Section 1.6, Section 11, Section 19.9, and Sections 20–21's confirmed Sales precedent) with no exception:

`ActorGuard → @CurrentActor() → explicit tenantId filtering` in every Prisma query, plus the private `require()`-style tenant-scoped helper pattern, so cross-tenant access resolves as a **404**, never a leaked 403 or data exposure.

**Permissions**: reuse existing Purchase permission constants where a natural fit exists (e.g. a `PURCHASE_INVOICES_*` family mirroring `PURCHASE_ORDERS_*`'s existing shape), but **no new permission constants are proposed or assumed here** — that is a separate decision to make at actual implementation time, following whatever pattern `libs/common/src/rbac/permissions.ts` already establishes (Section 1.6), not invented speculatively in this planning section.

### 22.15 Migration Safety

Any future Purchase Invoice/Supplier Payment/AP migration must follow the same binding rules already established for Goods Receipt V1 (Section 17.9, restated for Goods Receipt specifically in Section 19.10), carried forward here without modification:

- Additive/non-destructive only — new tables/nullable columns, no `DROP COLUMN`, no type narrowing, no new `NOT NULL` without a default.
- **Never truncate transactional data** to make a migration apply.
- **Never delete history** of any kind to simplify a migration.
- **Never edit already-applied migrations** — any future Purchase Invoice/Payment migration ships as new migration file(s) appended after the existing ones (`20260819120000_purchase_domain_v1`, `20260913183953_supplier_v1_details_and_addresses`, `20260913191233_purchase_order_v1_uom_discount_tax_snapshot`, and whatever Section 19's eventual Goods Receipt migration adds).
- **Backfill only where truthful** — if historical data cannot be reconstructed safely (e.g. there is no way to backfill an `invoicedQuantity` for pre-existing `PurchaseOrderItem` rows created before this phase existed), the new column stays **nullable**/defaults to a safe value (e.g. `0`) rather than inventing data.
- **The prior local `TRUNCATE`, explicitly, is not a precedent** — restating Section 17.10's own warning in spirit: the one-time local-development-environment reset performed during PO V1's initial migration was a disposable dev-data cleanup, not an acceptable migration strategy, and must never be repeated to resolve a schema conflict in any future Purchase Invoice/Payment/AP migration.

### 22.16 API Gateway

Expected future Gateway architecture, mirroring the existing, already-implemented Purchase Gateway pattern (Section 1.4) exactly — no new pattern proposed:

- Thin forwarding controllers (e.g. `PurchaseInvoicesController`, `SupplierPaymentsController` or nested payment routes) registered in `purchase-admin.module.ts`, following the existing `SuppliersController`/`PurchaseOrdersController`/`GoodsReceiptsController` shape.
- DTO parity with purchase-service — Swagger-decorated request/response DTOs mirroring the service-layer shapes 1:1, exactly as `apps/api-gateway/src/purchase/dto/*` already does for Supplier/PurchaseOrder.
- Reuse of `PurchaseForwardService` — the existing generic 1:1 HTTP proxy (base-URL resolution via `DownstreamRegistry`, `tenantId` stripping, actor-header forwarding, envelope unwrapping, error mapping) — **no changes anticipated** to `PurchaseForwardService` itself, since it is already fully generic/path-based.
- `JwtAuthGuard + PermissionsGuard` gating, mirroring every existing Purchase Gateway controller.
- Actor headers (`x-actor-user-id`/`x-actor-tenant-id`) derived from the JWT, forwarded exactly as today.
- Tenant stripping (client-supplied `tenantId`/`tenant_id` ignored), exactly as today.
- `{success,data}` envelope handling and upstream-error-to-Nest-exception mapping, exactly as today.

**None of this is implemented or scaffolded by this planning update** — it is documented so a future implementation session has the exact shape to build against, rather than needing to re-derive it from the existing Supplier/PurchaseOrder gateway code.

### 22.17 Angular

Intended future UI structure, following the already-established document-UI convention (Section 18.7's PO structure, Section 19.12's GR structure) rather than a flat product list:

**Purchase Invoice screen — proposed structure:**
1. **Invoice Header** — Invoice Number, Supplier Invoice Number, Supplier, Invoice Date, Due Date, Payment Terms, Status.
2. **Supplier information** — frozen supplier name/GSTIN/billing-address snapshot (§22.3, §22.7).
3. **Supplier invoice/reference information** — the supplier's own external reference, distinctly labeled from the system's own invoice number.
4. **PO/GR references** — which Purchase Order(s)/Goods Receipt(s) this invoice bills against, with links back to those documents.
5. **Invoice Lines** — Product, UOM, Quantity, Unit Cost, Discount %, Tax, Line Subtotal, Tax Amount, Line Total — mirroring PO V1's line-table structure (Section 18.7).
6. **Matching/validation information** — a surfaced view of §22.5's three-way-matching flags (over-invoice attempts, cost/tax/discount mismatches), so a user reviewing the invoice can see any discrepancy before finalizing it — this UI concept has no direct Sales precedent (Sales Invoice has no equivalent matching step), so it is new, Purchase-specific UI, not a copy.
7. **Totals** — Subtotal, Discount, Tax, Grand Total.
8. **Payment status** — current `paymentStatus`, `amountPaid`, computed `balanceDue`.
9. **Payment history** — list of recorded Supplier Payments against this invoice, mirroring how a Sales Invoice detail view could show its `SalesPayment` history.
10. **Notes**.

**Supplier Payment UI — proposed structure**: a payment-entry action against an invoice (or a dedicated Payments screen), showing invoice balance, amount to allocate, payment method, payment date, and reference — structured as a proper business action, not a bare amount field, consistent with Sales Payment's own precedent and this project's general document-UI conventions.

**None of this is implemented** — no component, model, or service file is created by this planning update.

### 22.18 Test Plan

Future test coverage, once implementation is approved, organized by concern (mirroring the depth already established for Section 19.14's Goods Receipt test plan and Sections 20–21's confirmed Sales Invoice/Payment behavior as a coverage baseline):

- Tenant isolation (cross-tenant Purchase Invoice/Payment access → 404).
- Supplier snapshot correctness at invoice creation (frozen, not re-derived from live `Supplier` data).
- PO/GR reference correctness (invoice line correctly ties back to the right `PurchaseOrderItem`/`GoodsReceiptItem`).
- Three-way matching: over-invoice-above-received rejection, over-invoice-above-ordered rejection, cost/tax/discount mismatch flagging (§22.5).
- Quantity validation (invoiced quantity accumulation, commercial-UOM consistency, never mixed with base-UOM values).
- Cost validation (unit cost handling, mismatch detection).
- Tax calculation (per-component, rounding convention, matches Section 18.5/20.3's already-tested formula).
- Discount calculation (percentage-only, matches existing convention).
- Totals (document-level sum-from-rounded-lines, matches existing convention).
- Invoice lifecycle (DRAFT editability, finalization requiring at least one line, status transitions).
- Cancellation rules (only from DRAFT/finalized, rejected once any payment recorded — mirrors `SalesInvoicesService.cancel()`, Section 20.4).
- Partial payment, multiple payments, full payment (accumulation logic, mirrors `recordPayment()`, Section 21.3).
- Overpayment prevention (amount exceeding `balanceDue` rejected).
- Concurrent payment allocation (row-locking correctness under concurrent `recordPayment()`-equivalent calls, mirroring the locking discipline documented in Section 21.3).
- `balanceDue` correctness (always `total - amountPaid`, never drifts, matches `SalesInvoice`'s non-persisted-column design, Section 20.2).
- Payment status transitions (`UNPAID → PARTIALLY_PAID → PAID`).
- Idempotency, where relevant (e.g. if a Phase-C accounting-integration event is eventually published, mirroring Sales Invoice's `send()`-publishes-an-event pattern, Section 20.5 — idempotent republication, not double-posting).
- Migration/backfill behavior (once an actual migration exists, per §22.15's rules — nullable/backfilled columns behave correctly against pre-existing data).

**No test code is written by this planning update** — this is the checklist a future implementation session should build `purchase-invoices.service.spec.ts`/`supplier-payments.service.spec.ts`-equivalent coverage against, following the repo's existing hand-built plain-object Prisma/audit mock convention (Section 1.6, Section 13).

### 22.19 Implementation Order

Explicit future sequence, superseding no prior approval and requiring its own at each step:

1. **Finish/verify Goods Receipt V1** according to Section 19 — implement (with its own separate explicit go-ahead) the Section 17/19 UOM snapshot fields, concurrency locking, and migration, and confirm it is stable before Purchase Invoice references GR data.
2. **Implement Purchase Invoice V1** (Phase A, §22.2–§22.8) — its own separate explicit go-ahead required.
3. **Implement Supplier Payment V1** (Phase B, §22.9–§22.10) — its own separate explicit go-ahead required, after Phase A exists.
4. **Perform a separate Accounts Payable / Accounting architecture review** (Phase C groundwork, §22.12) — a review, not an implementation step; produces its own planning document/decision before any AP/Accounting code is written.
5. **Implement Accounting integration** only after that review concludes and is itself explicitly approved.

**Currency/multi-currency remains a separate future phase**, orthogonal to this five-step sequence — it is not "Step 6" of this sequence, since it may end up spanning both Purchase and Sales together with Accounting rather than being a purely-Purchase follow-on (Section 23).

### 22.20 Scope Boundaries

This Purchase planning work (all of Section 22, this expansion included) does **NOT** authorize:

- Sales changes (Sections 20–21 remain reference-only; nothing here proposes modifying `apps/sales-service/**`).
- Inventory changes (`apps/inventory-service/**` untouched).
- Accounting journal posting (Phase C, explicitly gated behind its own separate review, §22.12).
- Currency or multi-currency (§22.13).
- Purchase Invoice implementation (Phase A remains unimplemented until its own explicit go-ahead).
- Supplier Payment implementation (Phase B remains unimplemented until its own explicit go-ahead, and until Phase A exists).

...unless a future implementation phase is explicitly approved, per the sequence in §22.19. Nothing in this expanded Section 22 should be read as authorization to begin writing code, schema, or migrations for any of the above.

---

## 23. Architectural Boundaries — End-to-End Business Flows

This section restates, for a single point of reference, the complete intended business flows spanning Purchase and Sales, their current implementation status, and the boundaries governing future work.

**Purchase (in progress — next phase Goods Receipt, Section 19; future phase Purchase Invoice/AP/Supplier Payment, Section 22):**
```
Supplier → Purchase Order → Goods Receipt → Purchase Invoice → Supplier Payment
```
`Supplier` and `Purchase Order` are implemented (Sections 2, 18). `Goods Receipt` exists today in its pre-Section-19 form and is the next phase to be extended, per Section 19's already-specified plan (not yet approved for implementation). `Purchase Invoice` and `Supplier Payment` are not implemented (Section 22).

**Sales (fully implemented, Quotation through Customer Payment):**
```
Customer → Quotation → Proforma Invoice (optional) → Sales Order → Shipment → Sales Invoice → Customer Payment
```
The complete Sales flow — including Sales Invoice and Customer Payment (`SalesPayment`) — is **already implemented and validated** in `apps/sales-service`. Sections 20–21 document that completed architecture for cross-module reference only.

**Governing clarifications:**

- **Goods Receipt (Section 19)** is the next Purchase operational phase — it is fully specified at a planning level and builds directly on Section 17's already-approved UOM/Inventory architecture. It requires only an explicit implementation go-ahead, not further architectural design.
- **Sales Invoice (Section 20) and Sales Payment (Section 21)** are **already completed** Sales-module functionality, documented here as reference architecture only — not as future work, and not as anything to be implemented as part of Purchase. (A prior version of this document incorrectly described them as future Sales-module roadmap items; that was corrected on 2026-09-14 — see Change History.)
- **Purchase Invoice / AP / Supplier Payment (Section 22)** are the only remaining future Purchase phases, recorded at a high, non-final level. They require their own dedicated, separately reviewed architecture pass before any schema or code work begins, in part because the current Accounting service does not yet provide a complete AP model/workflow — even though Sales' equivalent operational patterns (Sections 20–21) are already proven and available as a design precedent.
- **The Sales alternate-UOM→Inventory physical-quantity conversion gap** identified in Section 17.2/17.3/17.7 is a **separate, unscheduled future Sales-side fix** — it is not part of, and is not affected by, the current Purchase Goods Receipt work (Section 19). Section 19 corrects only the Purchase side of this shared gap; `apps/sales-service`'s `ShipmentItem`/`ShipmentsService` remain untouched and out of scope here, exactly as Section 17.7 already stated.
- **Currency/multi-currency** is intentionally deferred across every current and future phase referenced here (Section 18.3, Section 22.5) — it is never to be added incidentally "to prepare" for a later phase, in either Purchase or Sales; it requires its own explicitly reviewed phase, likely spanning both modules together with Accounting.
- **No accounting posting should be invented** simply because invoices or payments exist as operational documents — confirmed as Sales' own already-implemented convention (Section 20.5), and the same rule governs the future Purchase Invoice/Supplier Payment phase (Section 22).
- **No changes to Sales or Inventory** were made as part of this documentation-only correction — confirmed in the Change History entry below.
- **Section 17** remains authoritative for Purchase UOM/Inventory conversion — Section 19 implements it, and does not alter or reinterpret it.
- **Section 18** remains authoritative for the Sales-Order-like Purchase Order document structure — Section 19 and Section 22 build on it and do not alter or reinterpret it.

---

## Change History

> Every meaningful modification to the Purchase module must be appended here, in chronological order (newest entry appended at the bottom). Do not delete prior entries.

### 2026-09-14 — Planning phase (no repository files modified except this document)
- **Phase/feature**: Supplier V1 — architecture inspection & planning only.
- **What was changed**: No application code, schema, migration, DTO, service, controller, API Gateway, Angular, or test file has been modified. This document (`apps/purchase-service/PURCHASE_MODULE_PLAN.md`) is being created now, for the first time, as the initial planning record.
- **Why**: Establish a reconciled-against-repo implementation plan and a persistent in-repo record before any Supplier module code is touched, so future sessions have a single source of truth for what is approved, what remains to be done, and what must not be broken.
- **Files modified**: `apps/purchase-service/PURCHASE_MODULE_PLAN.md` (new — this file). No other repository file was created, modified, or deleted.
- **Database/schema/migration changes**: None.
- **API changes**: None.
- **Frontend changes**: None.
- **Tests added/changed**: None.
- **Verification results**: N/A — no application code changed; `git status --short` at the time of this entry should show only this Markdown file as new/untracked.
- **Architectural decisions**: See Section 16 — recorded now, prior to implementation, so they constrain all future work on this module.
- **Known limitations/technical debt**: None introduced (nothing implemented yet).
- **Deliberately not changed**: All application code, Prisma schema, migrations, DTOs, services, controllers, API Gateway, Angular, tests, `package.json` — implementation has not started and is not yet approved.
- **Commit hash**: (not yet committed)

### 2026-09-14 — Supplier V1 implemented (backend, gateway, Angular)
- **Phase/feature**: Supplier V1 — full implementation per Sections 2-13 of this document, executed after explicit user approval to begin.
- **What was changed**: Extended the `Supplier` Prisma model with the approved core fields; added `SupplierAddressType` enum and `SupplierAddress` model as a genuine sub-resource; extended purchase-service DTOs/service/controller and added a full `SupplierAddressesService`/`SupplierAddressesController`; mirrored all of it at the API Gateway; extended the Angular models/service/component/template to match Customer's UI architecture (Basic / Legacy Address / Supplier Details / Addresses sections with Billing and Dispatch `FormArray`s). Legacy `Supplier.address` column was left completely untouched (no rename, no drop, no backfill).
- **Why**: Bring Supplier to architectural parity with Customer, per the approved Supplier V1 scope, so purchasing can capture richer supplier data and structured billing/dispatch addresses without introducing a BusinessPartner abstraction or AP/accounting fields.
- **Files modified**:
  - Backend (purchase-service): `prisma/schema.prisma`; new migration `prisma/migrations/20260913183953_supplier_v1_details_and_addresses/`; `src/suppliers/dto/supplier.dto.ts` (extended); new `src/suppliers/dto/supplier-address.dto.ts`, `src/suppliers/dto/supplier-address-response.ts`, `src/suppliers/dto/supplier-response.ts`; `src/suppliers/suppliers.service.ts` (extended); new `src/suppliers/supplier-addresses.service.ts`, `src/suppliers/supplier-addresses.controller.ts`; `src/suppliers/suppliers.module.ts` (registers the new controller/service); `src/suppliers/suppliers.service.spec.ts` (extended); new `src/suppliers/supplier-addresses.service.spec.ts`.
  - API Gateway: `src/purchase/dto/supplier.dto.ts` (extended, added `SupplierWithAddressesDto`); new `src/purchase/dto/supplier-address.dto.ts`; `src/purchase/purchase-admin.module.ts` (registers `SupplierAddressesController`); new `src/purchase/supplier-addresses.controller.ts`. `src/purchase/suppliers.controller.ts` was not modified (no route changes needed — it already spreads the full DTO body through to purchase-service).
  - Angular (apps/web): `src/app/features/purchase/models/purchase.models.ts` (extended); `src/app/features/purchase/suppliers/supplier.service.ts` (extended with address endpoints); `src/app/features/purchase/suppliers/supplier-list.component.ts` and `.html` (extended with Basic / Legacy Address / Supplier Details / Addresses sections, mirroring `customer-list.component`).
- **Database/schema/migration changes**: Migration `20260913183953_supplier_v1_details_and_addresses` generated via `prisma migrate dev` against the local dev Postgres (`purchase_db`) and applied successfully. It added nullable columns (`company, email, phone, jobPosition, website, gstin, tags[], paymentTermId, fiscalPositionId, industryId, notes`) to `suppliers`, created the `SupplierAddressType` enum and `supplier_addresses` table (FK to `suppliers`, `ON DELETE CASCADE`), and added the planned composite indexes. `Supplier.address` was not touched. **Incidental, pre-existing drift picked up by the same migration**: the `SchemaMeta`/`_schema_meta` model already existed in `schema.prisma` (marked "Infrastructure-only marker. Not a business entity.") but had never actually been migrated into the database before this — Prisma's schema diff swept its `CREATE TABLE` into this migration since it was diffing current schema vs. migration history. This is unrelated to Supplier V1, harmless (empty, non-business table), and is disclosed here for transparency rather than silently bundled in. `prisma migrate dev` also rewrote a comment line in `migration_lock.toml` (cosmetic, tool-generated, no functional change).
- **API changes**: `POST/GET/PATCH /v1/suppliers[/:id]` now accept/return the expanded Supplier field set (all new fields optional except `code`/`name`, `gstin` optional-but-strict-if-present). New sub-resource endpoints: `POST/GET/PATCH/DELETE /v1/suppliers/:supplierId/addresses[/:addressId]`, reusing the existing `SUPPLIERS_READ`/`SUPPLIERS_UPDATE` permissions (no new permission constants added, matching Customer's convention).
- **Frontend changes**: Supplier list/detail/edit UI now shows Company/Email/Phone columns; the create/edit modal has Basic, Legacy Address, Supplier Details (payment term/fiscal position/industry dropdowns + notes), and Addresses (Billing/Dispatch `FormArray`s with add/remove/default) sections, matching Customer's UI architecture. Tags use the same chip-input UI as Customer.
- **Tests added/changed**: Extended `suppliers.service.spec.ts` with normalization tests (email lowercased, gstin uppercased, gstin-optional, update normalization, no-fields-to-update, unique-constraint-on-update) and updated existing assertions for the new `data`/`include` shapes. Added `supplier-addresses.service.spec.ts` mirroring `customer-addresses.service.spec.ts` (default-exclusivity transaction on create and on type-change, tenant-scoped 404 on missing parent supplier, delete-scope 404). No new e2e or Angular TestBed specs were added, consistent with the repo-wide convention (none exist for Customer or the prior Supplier either).
- **Verification results**: `npx prisma validate` passed; migration applied cleanly to local dev Postgres; `npx prisma generate` succeeded. `npx jest apps/purchase-service/src/suppliers` → 13/13 passed; full `npx jest apps/purchase-service` → 21/21 passed; `npx jest apps/api-gateway/src/purchase` → 3/3 passed (unaffected guard tests). `tsc --noEmit` clean for both `apps/purchase-service` and `apps/api-gateway`. `ng build --configuration=development` for `apps/web` completed with no TypeScript/template errors (only pre-existing, unrelated Sass deprecation warnings from the theme stylesheet). Manual browser verification (creating a supplier with the new fields and Billing/Dispatch addresses through the running UI, cross-tenant isolation check) was **not** performed in this session and is left for the user/a follow-up session — see Known Limitations.
- **Architectural decisions**: All decisions in Section 16 were followed as written; none were revisited or reinterpreted during implementation.
- **Known limitations/technical debt**:
  - Manual end-to-end browser verification (Verification Plan steps 4-6) has not been performed yet — the currently running Docker containers (`erp-purchase`, `erp-gateway`) are still serving the previous build and were intentionally left untouched; a rebuild/restart of those containers (or running the services in dev mode) is required before the new endpoints/UI are reachable live.
  - The incidental `_schema_meta` table creation (see above) is harmless but was not something this task set out to change; flagged here rather than hidden.
- **Anything deliberately NOT changed**: Purchase Order, Goods Receipt, inventory receipt behavior, Accounting integration, Purchase Invoice/AP, Supplier Payments, Customer/Sales module, `libs/common/src/rbac/permissions.ts`, `apps/identity-service/prisma/seed.ts` — none of these were touched, per Section 5 (Exact Files Explicitly Out of Scope).
- **Commit hash**: `9edccfc` (`feat(purchase): add supplier v1 details and addresses`)

### 2026-09-14 — Purchase Order V1 implemented (backend, gateway, Angular)
- **Phase/feature**: Purchase Order V1 — full implementation per the approved plan (mirroring Sales' `SalesOrder` UOM/discount/tax/snapshot architecture, migration `20260908141827_sales_documents_uom_discount_tax_snapshot`, onto `PurchaseOrder`/`PurchaseOrderItem`). First of three planned sequential phases: Purchase Order V1 → Purchase Invoice V1 → Accounting Integration. The latter two are roadmap-only so far, not yet planned in detail or implemented.
- **What was changed**: Extended `PurchaseOrder` with a frozen supplier snapshot (`supplierName`, `supplierGstin`, `supplierBillingAddress`, `supplierDispatchAddress`, `paymentTermId`) and computed totals (`subtotal`, `discountTotal`, `taxTotal`, `total`); extended `PurchaseOrderItem` with a product snapshot (`productSku`, `productName`), a UOM snapshot (`unitOfMeasureId`, `uomCode`, `uomName`, `conversionFactor` — record-only, never used in math), percentage-based discount (`discountPercent`/`discountAmount`), and tax (`taxCodeId`/`taxCode`/`taxCodeName`/`taxAmount`) resolved against a new `PurchaseOrderItemTaxComponent` child table; added a `mapLines()`/`sumTotals()` calculation pipeline (server-side, recomputed from scratch on every create/update, nothing trusted from the client) and a `snapshotSupplier()` helper (re-derives the snapshot only when `supplierId` itself changes, matching Sales' frozen-snapshot convention); added two new internal HTTP clients (`AccountingTaxCodeClient`, `InventoryProductClient`) reusing accounting-service's and inventory-service's existing internal endpoints as-is; extended the Angular model/service/component/template with per-line UOM/discount/tax-code inputs and a client-side display-only totals preview mirroring the backend formula.
- **Why**: Bring Purchase Order to architectural parity with Sales' `SalesOrder`, per the user's explicit three-phase roadmap request, so purchasing can capture UOM, discounts, and multi-component tax on order lines and compute real document totals instead of raw `quantity × unitCost` only.
- **Files modified**:
  - Backend (purchase-service): `prisma/schema.prisma` (extended `PurchaseOrder`/`PurchaseOrderItem`, added `PurchaseOrderItemTaxComponent`); new migration `prisma/migrations/20260913191233_purchase_order_v1_uom_discount_tax_snapshot/`; `src/common/decimal.ts` (added `parsePercent`/`roundMoney`, matching `apps/sales-service/src/common/decimal.ts`); new `src/accounting/accounting-tax-code.client.ts` + `accounting-client.module.ts`; new `src/inventory/inventory-product.client.ts` (added alongside the existing `inventory-stock.client.ts` in `src/inventory/inventory-client.module.ts`); `src/config/purchase-env.ts` (added required `ACCOUNTING_SERVICE_URL`); `src/purchase-orders/dto/purchase-order.dto.ts` (extended), `dto/purchase-order-response.ts` (extended); `src/purchase-orders/purchase-orders.service.ts` (rewritten with the calc/snapshot pipeline); `src/purchase-orders/purchase-orders.module.ts` (wires in the two new client modules); `src/purchase-orders/purchase-orders.service.spec.ts` (extended, 20 tests including previously-missing `cancel()`-with-receipts coverage); incidental cleanup of a pre-existing dead/broken `createService()` helper (duplicate object key, never called) in `src/goods-receipts/goods-receipts.service.spec.ts` — disclosed rather than silently fixed.
  - API Gateway: `src/purchase/dto/purchase-order.dto.ts` (extended request/response DTOs, Swagger). `src/purchase/purchase-orders.controller.ts` was not modified (no route changes — it already forwards the full DTO body/response through).
  - Angular (apps/web): `src/app/features/purchase/models/purchase.models.ts` (extended); `src/app/features/purchase/purchase-orders/purchase-order-list.component.ts` and `.html` (added per-line UOM select, discount-percent input, tax-code select, client-side totals preview mirroring `sales-order-list.component.ts`; header detail view now shows supplier GSTIN/billing/dispatch-address snapshot and document totals).
  - Infrastructure: `docker-compose.yml` (added `ACCOUNTING_SERVICE_URL` env var and an `accounting-service` `depends_on` entry to the `purchase-service` container definition, since purchase-service now calls accounting-service's internal tax-code endpoint).
- **Database/schema/migration changes**: Migration `20260913191233_purchase_order_v1_uom_discount_tax_snapshot` generated via `prisma migrate dev` against the local dev Postgres (`purchase_db`) and applied successfully — purely additive (new nullable/defaulted columns, new `purchase_order_item_tax_components` table with `ON DELETE CASCADE` FK to `purchase_order_items`). **Pre-migration data cleanup, disclosed**: the local dev DB held 7 `purchase_orders` / 8 `purchase_order_items` / 12 `goods_receipts` / 16 `goods_receipt_items` rows, all clearly disposable local test fixtures (dated 2026-08-19/20, notes like "Manual test", "partial PO"). The new `productSku`/`productName` snapshot fields are required (`NOT NULL`, no default) and cannot be backfilled from any data available in `purchase_db` (product master data lives in inventory-service's own database). Rather than weaken the schema (making them nullable) or invent placeholder SKU/name values that would persist as garbage data, these 4 transactional tables were `TRUNCATE`d before generating the migration, so it could be applied as a clean additive-with-NOT-NULL change. `suppliers`/`supplier_addresses` were **not** touched. This is safe only because the data was confirmed to be disposable local dev/test fixtures, never real business data — flagged here for full transparency, matching this document's established practice of disclosing incidental/collateral effects rather than hiding them.
- **API changes**: `POST/PATCH /v1/purchase-orders[/:id]` now require `productSku`, `productName`, and `unitOfMeasureId` on every line item (previously only `productId`/`quantity`/`unitCost`) and accept optional `discountPercent`/`taxCodeId` per line — a breaking change to the request shape, acceptable since this is pre-production dev data (same reasoning as Supplier V1's breaking DTO changes). Response shape gains `supplierName`/`supplierGstin`/`supplierBillingAddress`/`supplierDispatchAddress`/`paymentTermId`/`subtotal`/`discountTotal`/`taxTotal`/`total` at the header level and `productSku`/`productName`/UOM/discount/tax/`taxComponents` fields per line. No route or permission changes — existing `PURCHASE_ORDERS_*` permissions cover the expanded payload.
- **Frontend changes**: Purchase Order list now shows a Total column; the create/edit modal gained per-line UOM/discount%/tax-code controls plus a live, backend-formula-mirroring totals preview (subtotal/discount total/tax total/grand total), matching `sales-order-list.component.ts`'s pattern; the detail view now shows the supplier snapshot (GSTIN, billing address, dispatch address — labeled as the supplier's own shipping origin, distinct from our receiving warehouse) and full per-line UOM/discount/tax/line-total breakdown.
- **Tests added/changed**: `purchase-orders.service.spec.ts` rewritten with 20 tests: supplier snapshot on create (including null-address fallback and reject-unknown-supplier), full discount/single-component-tax/multi-component-tax/default-zero calculation coverage, UOM base-vs-alternative resolution and invalid-UOM rejection, document-level multi-line totals, update recompute-on-item-replace, snapshot-refresh-only-on-supplier-change, and the previously-missing `confirm()`-with-no-items and `cancel()`-with-receipts / `cancel()`-of-RECEIVED coverage. `goods-receipts.service.spec.ts` had its dead `createService()` helper removed (no behavior change — the function was never called).
- **Verification results**: `npx prisma validate` passed; migration applied cleanly to local dev Postgres; `npx prisma generate` succeeded. `npx jest apps/purchase-service` → 37/37 passed (20 in `purchase-orders.service.spec.ts` alone); `npx jest apps/api-gateway/src/purchase` → 3/3 passed (unaffected guard tests). `tsc --noEmit` clean for `apps/purchase-service`, `apps/api-gateway`, and `apps/web`. `ng build --configuration=development` for `apps/web` completed with no TypeScript/template errors (only pre-existing, unrelated Sass deprecation warnings). Manual browser verification and cross-tenant isolation check were **not** performed in this session — see Known Limitations, same disclosure pattern as Supplier V1.
- **Architectural decisions**: Kept the `unitCost` field name (did not rename to `unitPrice`) to avoid an unnecessary breaking rename of an already-used field. Added a `supplierGstin` header snapshot even though Sales has no equivalent GSTIN snapshot on any of its documents — an intentional, previously-flagged deviation from the Sales precedent, not an oversight. Deliberately did **not** extract a shared calculation utility across (future) Purchase document types — mirrors Sales' own established convention of hand-duplicating `mapLines()`/`sumTotals()` per document type with explanatory comments, per the "don't invent new abstractions when an established pattern exists" rule.
- **Known limitations/technical debt**:
  - Manual end-to-end browser verification has not been performed yet — the currently running Docker containers (`erp-purchase`, `erp-gateway`) still serve the previous build and were intentionally left untouched (beyond the docker-compose.yml env var addition, which only takes effect on next rebuild/restart).
  - The local dev DB's pre-existing Purchase Order/Goods Receipt test rows were truncated as part of this migration (see Database section above) — anyone relying on those specific local rows for other manual testing will need to recreate them under the new schema.
  - Goods Receipt still captures quantity only, no cost/value snapshot — deferred to Purchase Invoice V1 / Accounting Integration, per this plan's explicit out-of-scope list.
- **Anything deliberately NOT changed**: Goods Receipt logic/schema, Supplier/SupplierAddress, Purchase Invoice/AP, Supplier Payments, Accounting journal posting, Customer/Sales module, Inventory's or Accounting's own schema (only called via internal clients, never modified), `libs/common/src/rbac/permissions.ts` (no new permissions needed) — none of these were touched, per this plan's "Explicit out-of-scope for Purchase Order V1" section.
- **Commit hash**: `528b078` (`feat(purchase): add purchase order v1`)

### 2026-09-14 — UOM/Inventory conversion research (research-only, plan doc updated, no code changes)
- **Phase/feature**: PO V1 follow-up review — determine whether alternate-UOM quantities are converted to base-UOM before Inventory stock deduction/receipt, in both Sales and Purchase, and produce a comparison + proposed fix.
- **What was changed**: No application code, schema, migration, data, Angular, API Gateway, test, or Docker/config file was touched. This document gained new Section 17 ("PO V1 UOM/Inventory Architecture Revision") documenting the research findings, the precise Sales-vs-Purchase comparison table, and a proposed (not implemented) fix with a non-destructive migration strategy.
- **Why**: A prior review of PO V1 raised the question of whether the UOM/`conversionFactor` snapshot on `PurchaseOrderItem` actually affects the quantity posted to Inventory. Direct code inspection was needed to answer precisely rather than assume, and to determine whether this was a defect introduced by PO V1 specifically or a pre-existing, shared limitation.
- **Files modified**: `apps/purchase-service/PURCHASE_MODULE_PLAN.md` only (this entry + Section 17).
- **Database/schema/migration changes**: None. Section 17's migration SQL is a **proposal**, not applied.
- **API changes**: None.
- **Frontend changes**: None.
- **Tests added/changed**: None.
- **Verification results**: N/A — research/documentation only.
- **Architectural decisions**: None finalized yet — Section 17 is explicitly marked PROPOSED, pending approval. Section 16 will gain the rule described in §17.6 only once this is approved and implemented.
- **Known limitations/technical debt**: Confirmed (not new): (1) Purchase's `GoodsReceiptsService.preparePendingReceipt()` lacks the row-locking + in-flight-pending-quantity accounting that `ShipmentsService.preparePendingShipment()` has, making concurrent over-receipt possible; (2) `GoodsReceiptItem` carries no product-identity snapshot, unlike `ShipmentItem`; (3) neither Sales nor Purchase converts alternate-UOM quantities to base-UOM before they reach Inventory's `Stock`/`StockMovement` ledger — confirmed identical in both flows by direct code read.
- **Anything deliberately NOT changed**: `apps/purchase-service/src/goods-receipts/**`, `apps/purchase-service/prisma/schema.prisma`, any migration, `apps/inventory-service/**`, `apps/sales-service/**`, Angular, API Gateway, tests, Docker, configuration, database — all read-only this pass, per explicit instruction.
- **Commit hash**: (not yet committed)

### 2026-09-14 — Section 17 revised into final target architecture (research/documentation-only, plan doc updated, no code changes)
- **Phase/feature**: PO V1 UOM/Inventory Architecture Revision — Section 17 rewritten from an initial proposal into a fully-specified target architecture, per explicit direction after the user reviewed the Sales-vs-Purchase comparison research.
- **What was changed**: No application code, schema, migration, data, Angular, API Gateway, test, Docker, or configuration file was touched. `PURCHASE_MODULE_PLAN.md` Section 17 was rewritten (17.1–17.13) and the top Status line updated. The revision defines: (1) PO commercial quantity and GR quantity both stay in the PO's selected UOM, never mixed with base UOM; (2) `GoodsReceiptItem` gains a historical `unitOfMeasureId`/`uomCode`/`uomName`/`conversionFactor`/`productSku`/`productName` snapshot plus a derived `baseQuantity`, all copied from the parent `PurchaseOrderItem` and never re-resolved from live master data; (3) conversion to base-UOM happens exactly once, at the Purchase→Inventory boundary (`inventoryQuantity = receiptQuantity × historicalConversionFactor`); (4) Inventory itself is unchanged; (5) worked examples for base UOM, alternate UOM, partial receipt, multiple partial receipts, and a conversion-factor-changed-after-PO-creation scenario; (6) a dedicated Goods Receipt concurrency section specifying the required `FOR UPDATE` locking + in-flight-pending-quantity accounting, mirroring `ShipmentsService`, to be implemented together with the UOM fix; (7) an explicit statement that Sales carries the identical gap but is out of scope for this document; (8) a strictly non-destructive migration policy (never truncate, additive/backfill-only, never edit already-applied migrations); (9) an explicit record that the earlier local `TRUNCATE` was a one-time dev-environment reset, not a reusable migration strategy; (10) confirmation that Accounting/AP/Purchase Invoice/payments remain out of scope.
- **Why**: The user reviewed the prior proposal and the Sales fulfillment research, directionally approved the overall UOM/Inventory architecture, but explicitly withheld approval for actually implementing it, and required the design to be tightened on several specific points (commercial-UOM-only PO/GR quantities, no live re-resolution of conversion factor, explicit concurrency handling, explicit non-destructive migration rules, explicit disavowal of the prior TRUNCATE as a precedent) before any implementation could be considered.
- **Files modified**: `apps/purchase-service/PURCHASE_MODULE_PLAN.md` only (Status line + Section 17 rewrite + this entry).
- **Database/schema/migration changes**: None. Section 17 remains a specification, not applied code.
- **API changes**: None.
- **Frontend changes**: None.
- **Tests added/changed**: None.
- **Verification results**: N/A — documentation-only.
- **Architectural decisions**: Target architecture for the Goods Receipt UOM/conversion fix is now considered settled (§17.4–§17.9), pending only an implementation go-ahead. The Section 16 rule described in §17.12 is explicitly **not yet added** to Section 16 — it will be added only alongside actual implementation, not at documentation time.
- **Known limitations/technical debt**: Same three items carried over from the prior entry (Goods Receipt concurrency gap, missing product snapshot, no UOM-to-base conversion) — now fully specified for correction in §17.4/§17.6, but still unimplemented.
- **Anything deliberately NOT changed**: `apps/purchase-service/src/goods-receipts/**`, `apps/purchase-service/prisma/schema.prisma`, any migration, `apps/inventory-service/**`, `apps/sales-service/**`, Angular, API Gateway, tests, Docker, configuration, database — all read-only this pass. Supplier V1 and prior Purchase Order V1 Change History entries (Sections 1–16 and the three earlier Change History entries) are unmodified and intact.
- **Commit hash**: (not yet committed)

### 2026-09-14 — Section 18 added: Purchase Order V1 sales-order-like document structure (planning-only, plan doc updated, no code changes)
- **Phase/feature**: Purchase Order V1 follow-up planning — extend PO V1 from a supplier-plus-lines document into a fuller business document (header/buyer/delivery/address fields), mirroring the existing Sales Order document pattern where applicable, per explicit user-approved scope.
- **What was changed**: No application code, schema, migration, data, Angular, API Gateway, test, Docker, or configuration file was touched. `PURCHASE_MODULE_PLAN.md` gained new Section 18 ("Purchase Order V1 — Sales-Order-Like Document Structure") specifying: (1) new PO header fields — PO Number, Supplier Reference, Expected Delivery Date, Buyer/Purchaser (an Identity user reference, not Master Data), Payment Terms, Receiving Warehouse, plus the already-implemented Supplier Billing/Dispatch Address snapshots and Notes; (2) an explicit list of deferred fields — Currency, Exchange Rate, Multi-currency pricing, Purchase Invoice, AP, Supplier payments, Accounting posting — none of which are to be added merely to prepare for a future phase; (3) the PO line field set and the server-authoritative totals formula (unchanged from the already-implemented calculation convention, restated here for document completeness); (4) snapshot rules consistent with the existing PO V1 invariants (Section 16) and Section 17's Goods Receipt conversion-factor freezing; (5) a recommended Angular UI structure (Header / Supplier-Address / Order Lines / Totals / Notes) mirroring the Sales Order screen; (6) an explicit scope boundary reiterating that Purchase Invoice, AP, supplier payments, accounting posting, currency, and any Sales/Inventory changes beyond Section 17 are out of scope; (7) an explicit implementation-status note requiring Claude to inspect the already-implemented PO V1 code and reconcile it against Sections 17 and 18 before writing any code, and to keep any future implementation additive/non-destructive. The Status line at the top of the document was updated to reference Section 18.
- **Why**: The user reviewed the already-implemented Purchase Order V1 and requested it be planned out as a more complete business document (header metadata, buyer/purchaser, delivery expectations, receiving warehouse) consistent with the Sales Order pattern, while explicitly deferring currency/multi-currency and all AP-related functionality to a later, separately reviewed phase.
- **Files modified**: `apps/purchase-service/PURCHASE_MODULE_PLAN.md` only (Status line + Section 18 + this entry).
- **Database/schema/migration changes**: None. Section 18 is a specification, not applied code.
- **API changes**: None.
- **Frontend changes**: None.
- **Tests added/changed**: None.
- **Verification results**: N/A — documentation-only.
- **Architectural decisions**: Section 18 is recorded as an approved planning addition only; none of its fields (PO Number sequencing, Buyer/Purchaser Identity reference, Receiving Warehouse default, etc.) are implemented yet. Currency is explicitly and deliberately excluded from this phase, per direct user instruction, and must not be silently added later without its own review.
- **Known limitations/technical debt**: None introduced (nothing implemented yet). The existing PO V1 implementation (Change History entry "Purchase Order V1 implemented") has not yet been reconciled against Section 18 — that reconciliation is required before implementation begins, per §18.9.
- **Anything deliberately NOT changed**: All application code, Prisma schema, migrations, DTOs, services, controllers, API Gateway, Angular, tests, Docker, configuration, database — read-only this pass. Sections 1–17 and all prior Change History entries are unmodified and intact.
- **Commit hash**: (not yet committed)

### 2026-09-14 — Sections 19–22 added: Goods Receipt V1 plan, Sales Invoice/Payment roadmap, Purchase Invoice/AP/Supplier Payment roadmap, and architectural boundaries summary (planning-only, plan doc updated, no code changes)
- **Phase/feature**: Forward-looking planning update extending the living plan beyond Purchase Order V1/Section 17/Section 18 to cover the full intended Purchase and Sales document chains, per explicit user request.
- **What was changed**: No application code, schema, migration, data, Angular, API Gateway, test, Docker, or configuration file was touched. `PURCHASE_MODULE_PLAN.md` gained four new sections plus this entry:
  - **Section 19 — Goods Receipt V1**: a full implementation plan (header, lines, UOM architecture, receiving behavior, concurrency, Inventory integration, snapshot rules, tenant isolation, migration strategy, API Gateway/Angular requirements, validation, and a comprehensive test plan) built strictly on top of Section 17's already-approved target architecture. It also adds one new rule not previously stated in Section 17: an alternate-UOM PO line with a missing/invalid `conversionFactor` must cause Goods Receipt line creation to be rejected, never silently default to a conversion factor of `1`.
  - **Section 20 — Sales Invoice V1**: a Sales-module roadmap/reference (header, lines, calculation, lifecycle, snapshot immutability, accounting boundary, currency deferral), explicitly marked as belonging to `apps/sales-service`/Sales API Gateway/Angular Sales, not Purchase.
  - **Section 21 — Sales Payment V1**: a Sales-module roadmap/reference (payment document, invoice allocation, balance/status, validation, cancellation/reversal, accounting boundary, currency deferral), same out-of-Purchase-scope marking as Section 20.
  - **Section 22 — Purchase Invoice / AP / Supplier Payment**: a high-level, explicitly non-final future roadmap covering Purchase Invoice, three-way matching (PO ↔ Goods Receipt ↔ Supplier Invoice), supplier payable/balance, and Accounts Payable, with an explicit statement that a separate architecture review is required because Accounting does not yet provide a complete AP model/workflow.
  - **Section 23 — Architectural Boundaries**: a single-reference summary of the full intended Purchase flow (`Supplier → Purchase Order → Goods Receipt → Purchase Invoice → Supplier Payment`) and Sales flow (`Customer → Quotation → Proforma Invoice (optional) → Sales Order → Shipment → Sales Invoice → Customer Payment`), restating that Goods Receipt is the next Purchase operational phase, Sales Invoice/Payment are Sales-module items, Purchase Invoice/AP/Supplier Payment need their own architecture review, currency remains deferred everywhere, no accounting posting should be invented incidentally, and Sections 17/18 remain authoritative for their respective areas.
  The top Status line was updated to reference Sections 19–22 as planning-only and not implemented.
- **Why**: The user asked the living plan to be extended to cover the next major business-document phases (Goods Receipt, Sales Invoice, Sales Payment, and the eventual Purchase Invoice/AP/Supplier Payment chain) so future sessions have a single, reconciled reference for the intended end-to-end Purchase and Sales flows, while explicitly keeping this update documentation-only and requiring separate approval before any implementation.
- **Files modified**: `apps/purchase-service/PURCHASE_MODULE_PLAN.md` only (Status line + Sections 19–23 + this entry).
- **Database/schema/migration changes**: None. Sections 19–22 are specifications, not applied code.
- **API changes**: None.
- **Frontend changes**: None.
- **Tests added/changed**: None.
- **Verification results**: N/A — documentation-only; `git status` at the time of this entry shows only this Markdown file modified, no other file touched.
- **Architectural decisions**: Goods Receipt V1 (Section 19) is recorded as ready for an implementation go-ahead once approved, since it builds entirely on Section 17's already-approved architecture. Sales Invoice V1 and Sales Payment V1 (Sections 20–21) are recorded as Sales-module roadmap items only — this document does not claim ownership of their implementation. Purchase Invoice/AP/Supplier Payment (Section 22) is recorded as requiring a separate, dedicated architecture review before any schema/code design, because the current Accounting service does not yet provide a complete AP model/workflow. Currency/multi-currency is reaffirmed as deferred across every section added in this update.
- **Known limitations/technical debt**: None introduced (nothing implemented yet). Section 19 still requires its own explicit implementation go-ahead, separate from Section 17's. Sections 20–21 require Sales-module ownership/approval before any Sales-side work begins. Section 22 requires a dedicated architecture review before it can even be planned in implementation-level detail.
- **Anything deliberately NOT changed**: All application code, Prisma schema, migrations, DTOs, services, controllers, API Gateway, Angular, tests, Docker, configuration, database — read-only this pass, in every module (Purchase, Sales, Inventory, Accounting, Identity). Sections 1–18 and all prior Change History entries are unmodified and intact. No file was staged, committed, or pushed.
- **Commit hash**: (not yet committed)

### 2026-09-14 — Correction: Sections 20–21 re-scoped from "future Sales roadmap" to "completed/existing Sales reference"; Section 22–23 cross-references updated (documentation-only, plan doc updated, no code changes)
- **Phase/feature**: Project-state correction to the prior planning update (the "Sections 19–22 added" entry, same date). The prior entry incorrectly described Sales Invoice and Sales Payment as future Sales-module implementation phases; the user corrected this — both are **already completed and validated** in `apps/sales-service`.
- **What was changed**: No application code, schema, migration, data, Angular, API Gateway, test, Docker, or configuration file was touched, in Purchase, Sales, or any other module. `PURCHASE_MODULE_PLAN.md` was corrected as follows:
  - **Section 20** was retitled from "Sales Invoice V1 — Sales-Module Roadmap / Reference" to "Sales Invoice — Completed / Existing Sales Reference" and rewritten to document the actual, already-implemented `SalesInvoice`/`SalesInvoiceItem`/`SalesInvoiceItemTaxComponent` schema and `sales-invoices.service.ts` behavior, confirmed by direct code read of `apps/sales-service/prisma/schema.prisma` and `apps/sales-service/src/sales-invoices/sales-invoices.service.ts` — including the non-persisted computed `balanceDue`, the `create()`/`update()`/`send()`/`cancel()` lifecycle (cancellation blocked once any payment is recorded), and the confirmed-by-code-comment "Sales must not write accounting journals itself" boundary. No new Sales Invoice implementation work is proposed.
  - **Section 21** was retitled from "Sales Payment V1 — Sales-Module Roadmap / Reference" to "Sales Payment — Completed / Existing Sales Reference" and rewritten to document the actual, already-implemented `SalesPayment` schema and `recordPayment()` behavior (row-locked balance check, `SENT`-only/not-already-`PAID` gating, over-allocation rejection, accumulation-based partial/full payment support) — and explicitly documents, as accurate current state rather than a gap to fix, that **no payment cancellation/reversal endpoint currently exists** in `sales-invoices.controller.ts`. No new Sales Payment implementation work is proposed.
  - **Section 22** (Purchase Invoice/AP/Supplier Payment) was left as future/unimplemented Purchase roadmap, with its cross-references to Sections 20–21 updated to point at the corrected section numbers/content (e.g. `balanceDue` design reference now points to Section 20.2/20.7, payment-allocation reference now points to Section 21.3/21.7) and an added note that this is now the one remaining genuine architectural gap in the Purchase document chain, since Sales' equivalent patterns are already proven.
  - **Section 23** was updated to state that Sales Invoice/Payment are already completed (not future work), to restate the current Purchase/Sales flows with accurate implementation status per stage, and to add an explicit clarification that the Sales alternate-UOM→Inventory conversion gap (Section 17.2/17.3/17.7) is a separate, unscheduled future Sales-side fix, unaffected by and not part of the current Purchase Goods Receipt work (Section 19).
  - The top **Status line** was corrected to reflect that Sales Invoice/Payment are completed, not planning-only, and to flag that this was a correction of the prior entry.
- **Why**: The user identified that the prior planning update incorrectly treated already-shipped Sales functionality (Sales Invoice, Sales Payment) as if it were unimplemented future work. Documentation that misstates what already exists is worse than no documentation, since a future session could mistakenly propose reimplementing completed functionality or misjudge what remains outstanding in the Purchase document chain. The correction also reaffirms that the previously-identified Sales alternate-UOM/Inventory conversion gap (Section 17) is unrelated to, and not resolved or affected by, the current Purchase-side Goods Receipt work (Section 19).
- **Files modified**: `apps/purchase-service/PURCHASE_MODULE_PLAN.md` only (Status line + Sections 20–23 rewritten + this entry).
- **Database/schema/migration changes**: None.
- **API changes**: None.
- **Frontend changes**: None.
- **Tests added/changed**: None.
- **Verification results**: N/A — documentation-only. Section 20–21's claims about existing Sales behavior were verified by direct reading of `apps/sales-service/prisma/schema.prisma` (`SalesInvoice`, `SalesInvoiceItem`, `SalesInvoiceItemTaxComponent`, `SalesPayment` models) and `apps/sales-service/src/sales-invoices/sales-invoices.service.ts`/`sales-invoices.controller.ts` (not merely re-asserted from the prior, incorrect entry) — `git status` at the time of this entry shows only this Markdown file modified, no Sales/Inventory/other file touched.
- **Architectural decisions**: Sales Invoice and Sales Payment are reaffirmed as out of this document's implementation scope in both directions — this document neither claims ownership of them (they are Sales-owned and already shipped) nor proposes redoing them. Section 22 (Purchase Invoice/AP/Supplier Payment) remains the only unimplemented item in the Purchase document chain beyond Goods Receipt (Section 19), and is now explicitly anchored to Sales' proven design as precedent rather than an untested hypothetical.
- **Known limitations/technical debt**: None introduced. Carried forward accurately: Goods Receipt V1 (Section 19) still requires its own explicit implementation go-ahead; Purchase Invoice/AP/Supplier Payment (Section 22) still requires a dedicated architecture review before any schema/code design, because Accounting does not yet provide a complete AP model; the Sales alternate-UOM/Inventory conversion gap (Section 17.7) remains unscheduled and Sales-owned.
- **Anything deliberately NOT changed**: All application code, Prisma schema, migrations, DTOs, services, controllers, API Gateway, Angular, tests, Docker, configuration, database — read-only this pass, in every module (Purchase, Sales, Inventory, Accounting, Identity). Sections 1–19 and all prior Change History entries are unmodified and intact. No file was staged, committed, or pushed.
- **Commit hash**: (not yet committed)

### 2026-09-14 — Section 22 expanded into a detailed future Purchase Invoice / Supplier Payment / AP architecture plan (documentation-only, plan doc updated, no code changes)
- **Phase/feature**: Purchase-module living-plan expansion, per explicit user request, to turn Section 22 from a brief high-level roadmap into an implementation-ready architecture specification for the remaining unimplemented Purchase document chain, so a future session can prepare an implementation plan without rediscovering the design from scratch. Documentation/planning only — no implementation authorized.
- **What was changed**: No application code, schema, migration, data, Angular, API Gateway, test, Docker, or configuration file was touched, in Purchase, Sales, Inventory, Accounting, or any other module. `PURCHASE_MODULE_PLAN.md` Section 22 was retitled from "Purchase Invoice / AP / Supplier Payment — Future Roadmap (High-Level, Planning Only)" to "Purchase Invoice / Supplier Payment / Accounts Payable — Future Architecture Plan (Phases A–C, Not Implemented)" and expanded from 5 subsections to 20 (§22.1–§22.20), organized into three explicit phases:
  - **PHASE A — Purchase Invoice V1** (§22.2–§22.8): business flow and PO/GR/Supplier/Payment relationships with an explicit proposed-vs-not-decided table (§22.2); header fields (§22.3); line fields including a proposed `invoicedQuantity` accumulator on `PurchaseOrderItem` (§22.4); three-way matching rules between ordered/received/invoiced quantity and cost/tax/discount, with tolerance policy explicitly left as an undecided future business decision rather than invented (§22.5); the already-established calculation convention restated for Purchase Invoice (§22.6); snapshot rules, including one genuinely open question (re-resolve tax at invoice time vs. copy forward from the PO line) flagged rather than silently decided (§22.7); and a proposed DRAFT/finalized/CANCELLED lifecycle explicitly not copying Sales' `SENT` naming verbatim (§22.8).
  - **PHASE B — Supplier Payment V1** (§22.9–§22.10): a line-by-line adaptation of the already-implemented `SalesPayment`/`recordPayment()` behavior (row locking, accumulation-based partial/full payment, overpayment rejection) to a proposed `purchaseInvoiceId`-scoped child resource, with payment reversal explicitly not proposed (matching Sales Payment's own current unreversed state); and reuse of the existing Payment Method master-data concept with no duplicate Purchase-specific payment-method master (§22.10).
  - **PHASE C — Accounts Payable / Accounting Integration** (§22.12): expanded roadmap-level (not implementation-level) coverage of payable balance, aging, credit/debit adjustments, journal integration, payable account, and reconciliation — explicitly with no final schema proposed and reaffirmed as requiring its own separate, dedicated architecture review.
  - Cross-cutting subsections: an explicit accounting boundary restating Sales Invoice/Payment's own confirmed "no journal posting from this service" convention as the Purchase precedent (§22.11); currency/multi-currency reaffirmed as deferred across all three phases (§22.13); tenancy/authorization (§22.14); migration safety, carrying forward Section 17.9/19.10's non-destructive rules and the explicit disavowal of the prior local `TRUNCATE` as a precedent (§22.15); API Gateway architecture (§22.16); Angular UI structure, including a new "matching/validation information" section with no Sales precedent (§22.17); a comprehensive future test plan (§22.18); an explicit five-step implementation order spanning Goods Receipt V1 completion through the AP architecture review (§22.19); and explicit scope boundaries reaffirming no Sales/Inventory/Accounting changes and no implementation authorization (§22.20).
  - The top **Status line** was updated to reflect the Section 22 expansion.
- **Why**: The user asked for Section 22 to be detailed enough that a future Claude session could build an implementation plan for Purchase Invoice and Supplier Payment without rediscovering the architecture from scratch, explicitly instructing that the already-completed Sales Invoice/Sales Payment implementation (Sections 20–21) be used as the primary reference for operational-document behavior — adapted carefully for Purchase rather than copied blindly — while keeping Accounts Payable and Accounting Integration as a clearly separate, not-yet-reviewed phase, and keeping currency deferred throughout.
- **Files modified**: `apps/purchase-service/PURCHASE_MODULE_PLAN.md` only (Status line + Section 22 rewritten/expanded + this entry).
- **Database/schema/migration changes**: None. Section 22 remains a specification; no schema files or migrations were created. Verified before writing: `apps/purchase-service/prisma/schema.prisma` was inspected directly and confirmed to contain no `PurchaseInvoice` or `SupplierPayment` model — the "not implemented" status asserted throughout this section is not a re-assertion of a prior claim but a freshly-verified fact.
- **API changes**: None.
- **Frontend changes**: None.
- **Tests added/changed**: None.
- **Verification results**: N/A — documentation-only. `apps/purchase-service/prisma/schema.prisma`'s `PurchaseOrder`/`PurchaseOrderItem`/`GoodsReceipt`/`GoodsReceiptItem` models were re-read directly to ground the proposed Purchase Invoice header/line fields and matching rules in the actual current schema shape (e.g. confirming `GoodsReceiptItem` still has no UOM/product snapshot fields today, consistent with Section 19 being unimplemented) rather than assuming from memory. `git status` at the time of this entry shows only this Markdown file modified, no Sales/Inventory/Accounting/other file touched.
- **Architectural decisions**: Purchase Invoice is proposed to reference exactly one Purchase Order by default (multi-PO invoicing explicitly left undecided); an invoice may reference multiple Goods Receipts under the same PO (treated as settled, since it follows from the already-approved partial-receipt architecture); three-way-matching tolerance policy is explicitly not invented and left as a future business decision; payment reversal is explicitly not proposed for Supplier Payment V1, matching Sales Payment's current unreversed implementation; Accounts Payable/Accounting Integration remains gated behind its own separate architecture review, unchanged from the prior version of this document.
- **Known limitations/technical debt**: None introduced (nothing implemented). Genuine open questions were flagged rather than resolved, by design: whether a Purchase Invoice may span multiple POs; whether a `goodsReceiptItemId` reference should be mandatory on every invoice line; whether tax should be re-resolved at invoice time or copied forward from the PO line; the exact finalized-invoice-status name; whether an approval step is needed before an invoice can be finalized; and the three-way-matching tolerance policy. All are explicitly marked as requiring a later decision rather than silently resolved in one direction.
- **Anything deliberately NOT changed**: All application code, Prisma schema, migrations, DTOs, services, controllers, API Gateway, Angular, tests, Docker, configuration, database — read-only this pass, in every module (Purchase, Sales, Inventory, Accounting, Identity). Sections 1–21 and all prior Change History entries are unmodified and intact. No file was staged, committed, or pushed.
- **Commit hash**: (not yet committed)

### 2026-09-14 — Purchase Order V1 extended into a full business document (Section 18 implemented: backend, gateway, Angular)
- **Phase/feature**: Implementation of Purchase Order V1's remaining Section 18 header fields (PO Number, Supplier Reference, Expected Delivery Date, Buyer/Purchaser, independently-overridable Payment Terms, Receiving Warehouse), executed after explicit user approval to implement (not merely plan). Scope was strictly limited to Purchase Order V1 — no Purchase Invoice, Supplier Payment, AP, Accounting posting, currency, Sales, Inventory, or Goods Receipt V1 (Section 19) UOM/conversion work was implemented.
- **What was changed**: Before writing any code, the current implementation was inspected directly: `apps/purchase-service/prisma/schema.prisma`, `purchase-orders.service.ts`/`.dto.ts`/`-response.ts`, `apps/api-gateway/src/purchase/purchase-orders.controller.ts`/`dto/purchase-order.dto.ts`, `apps/web/src/app/features/purchase/purchase-orders/*`, `apps/purchase-service/src/goods-receipts/goods-receipts.service.ts` (for compatibility), and Sales' equivalents (`sales-orders.service.ts`, `proforma-invoices.service.ts`'s `nextDocumentNumber()`/retry-loop pattern, `sales-order-list.component.ts`'s `salespersonId`/`paymentTermId`/Identity-user-dropdown pattern) as the primary reference. Found: PO V1's calculation pipeline (gross-based `subtotal`, `discountTotal`, `taxTotal`, HALF_UP 4-decimal rounding, independent tax-component calculation) was already correctly implemented exactly per the approved formula — no calculation bug existed, nothing there was changed.
  - **Schema/migration**: `PurchaseOrder` gained `poNumber` (`String`, `@@unique([tenantId, poNumber])`), `supplierReference` (`String?`), `expectedDeliveryDate` (`DateTime?`), `buyerId` (`String? @db.Uuid`, soft Identity reference, no relation), and `warehouseId` (`String? @db.Uuid`, soft reference, informational-only "default receiving warehouse" — explicitly distinct from and never written to `GoodsReceipt.warehouseId`). `paymentTermId` (already existing) is now independently settable in the DTO rather than purely supplier-derived.
  - **purchase-service**: `CreatePurchaseOrderDto`/`UpdatePurchaseOrderDto` extended with the five new fields (`@IsUUID`/`@IsISO8601`/`@MaxLength` validation, matching Sales' exact decorator choices for the equivalent fields). `PurchaseOrdersService.create()` now allocates `poNumber` via a `nextPoNumber()` helper (`PO-00000001`-style, count-based) inside a 5-attempt retry loop catching `isUniqueConstraintError` (P2002) — copied field-for-field from `ProformaInvoicesService`/`SalesInvoicesService`'s identical numbering pattern, including that pattern's own (pre-existing, unchanged) dead-code quirk where the 5th collision re-throws the raw error rather than reaching the loop's trailing `ConflictException`. `update()` extended so `paymentTermId` follows `SalesOrdersService.update()`'s exact precedence rule (explicit DTO value always wins; otherwise re-derived from the supplier only when the supplier itself changes) and the four other new fields are plain pass-through (`undefined` = untouched, explicit `null` = cleared). `mapLines()` gained one validation rule not previously enforced: an alternate (non-base) UOM's `conversionFactor` is now parsed via a new `parseConversionFactor()` (`common/decimal.ts`) requiring a valid positive decimal — a missing/invalid factor is rejected with `BadRequestException` instead of either silently defaulting to 1 (explicitly forbidden) or throwing an uncaught `Prisma.Decimal` constructor error (the prior, less clean failure mode).
  - **API Gateway**: `CreatePurchaseOrderDto`/`UpdatePurchaseOrderDto`/`PurchaseOrderDto` in `apps/api-gateway/src/purchase/dto/purchase-order.dto.ts` mirror the five new fields with Swagger decorators. `purchase-orders.controller.ts` required no changes — it already forwards the full DTO body/response through via `PurchaseForwardService` (unchanged).
  - **Angular**: `purchase.models.ts` extended (`PurchaseOrder`, `CreatePurchaseOrderRequest`, `UpdatePurchaseOrderRequest`). `purchase-order-list.component.ts` now injects `WarehouseService`, `UserService` (Identity users, for Buyer/Purchaser — exactly mirroring `sales-order-list.component.ts`'s `salespersonId` dropdown pattern), and `MasterDataService` (payment terms); adds `buyerLabel()`/`warehouseLabel()`/`paymentTermLabel()` helpers mirroring `salespersonLabel()`/`paymentTermLabel()` exactly; form/create/edit/save extended with the five new fields. `purchase-order-list.component.html`: list table now shows PO Number (replacing the truncated UUID column); create/edit modal gained Supplier Reference, Expected Delivery Date, Buyer/Purchaser, Payment Terms (with "use supplier default" as the empty option), and Receiving Warehouse fields, plus explanatory text clarifying Receiving Warehouse here is informational only and Goods Receipt still selects its own destination; detail view shows all five new fields plus the PO Number.
- **Why**: The user explicitly approved implementation (not further planning) of Purchase Order V1's remaining Section 18 scope, so Purchase Order becomes a proper business document comparable in structure to the completed Sales Order flow, while explicitly excluding Purchase Invoice/Supplier Payment/AP/Accounting/currency/Sales/Inventory/Goods Receipt V1 from this task's scope.
- **Files modified**:
  - Backend (purchase-service): `prisma/schema.prisma` (extended `PurchaseOrder`); new migration `prisma/migrations/20260914100000_po_v1_document_fields/`; `src/common/decimal.ts` (added `parseConversionFactor`); `src/purchase-orders/dto/purchase-order.dto.ts` (extended), `dto/purchase-order-response.ts` (extended); `src/purchase-orders/purchase-orders.service.ts` (PO numbering + retry loop, new-field handling, conversion-factor validation); `src/purchase-orders/purchase-orders.service.spec.ts` (extended, +19 tests).
  - API Gateway: `src/purchase/dto/purchase-order.dto.ts` (extended request/response DTOs, Swagger). `src/purchase/purchase-orders.controller.ts` was not modified (no route changes needed).
  - Angular (apps/web): `src/app/features/purchase/models/purchase.models.ts` (extended); `src/app/features/purchase/purchase-orders/purchase-order-list.component.ts` and `.html` (new header fields, lookups, labels, form/save wiring).
  - Nothing under `apps/purchase-service/src/goods-receipts/**`, `apps/inventory-service/**`, `apps/sales-service/**`, or `apps/accounting-service/**` was touched.
- **Database/schema/migration changes**: New migration `20260914100000_po_v1_document_fields`, generated via `prisma migrate diff` (non-interactive; `prisma migrate dev` refused to run non-interactively in this session) against the live local `purchase_db`, hand-reviewed, and applied via `prisma migrate deploy`. **Purely additive**: `ALTER TABLE "purchase_orders" ADD COLUMN "buyerId" UUID, ADD COLUMN "expectedDeliveryDate" TIMESTAMP(3), ADD COLUMN "poNumber" TEXT NOT NULL, ADD COLUMN "supplierReference" TEXT, ADD COLUMN "warehouseId" UUID`, plus two new non-unique indexes and one new unique index (`purchase_orders_tenantId_poNumber_key`). **`poNumber TEXT NOT NULL` required no backfill and no nullable-then-later-tightened workaround**: `purchase_orders`/`purchase_order_items`/`goods_receipts`/`goods_receipt_items` were confirmed via direct `SELECT count(*)` to hold **zero rows** before this migration (a residual state from the earlier, already-disclosed local `TRUNCATE` performed during PO V1's initial migration, per Section 17.10 — not a new truncation, and no table was truncated as part of this change). `suppliers` (4 existing rows) and every other table were untouched. No transactional data was deleted, truncated, or fabricated as part of this migration.
- **API changes**: `POST/PATCH /v1/purchase-orders[/:id]` now accept optional `supplierReference`, `expectedDeliveryDate`, `buyerId`, `paymentTermId` (now independently settable, not just supplier-derived), and `warehouseId`. Response shape gains `poNumber`, `buyerId`, `warehouseId`, `supplierReference`, `expectedDeliveryDate`. No route or permission changes — existing `PURCHASE_ORDERS_*` permissions cover the expanded payload, per plan.
- **Frontend changes**: Purchase Order list now shows PO Number instead of a truncated UUID; create/edit modal and detail view show Supplier Reference, Expected Delivery Date, Buyer/Purchaser, Payment Terms (overridable, supplier-default otherwise), and Receiving Warehouse (informational).
- **Tests added/changed**: `purchase-orders.service.spec.ts` extended with a new "PO V1 document fields" describe block (PO number generation/format, retry-on-P2002-collision success, exhaust-5-attempts failure mode, new-field persistence, paymentTermId supplier-default vs. explicit-override on both create and update, update pass-through/untouched/explicit-null semantics for the four other new fields) plus two new cases in the existing "UOM/discount/tax calculation" block (alternate-UOM conversionFactor missing → rejected; conversionFactor `0` → rejected) and two exact worked-example tests requested for this task: the multi-line `subtotal=450.0000 / discountTotal=35.0000 / taxTotal=74.7000 / grandTotal=489.7000` document-totals example, and the "2 BOX at conversionFactor 10 persists as `quantity=2`, never pre-multiplied to `20`" alternate-UOM example. `basePrisma()`'s test helper was extended to default-mock `purchaseOrder.count` (for PO-number generation) without needing every existing `purchaseOrder: { create: ... }` override to repeat it. No Angular TestBed specs were added — none exist anywhere in this repo for any feature (Section 1.6, Section 13), and this task did not introduce the repo's first one; this is a deliberate consistency choice, not an oversight.
- **Verification results**: `npx prisma validate` passed; migration applied cleanly to local dev Postgres (`purchase_db`); `npx prisma generate` succeeded. `npx jest apps/purchase-service` → 50/50 passed (up from 37; +13 net new tests, some prior tests also gained assertions). `npx jest apps/api-gateway/src/purchase` → 3/3 passed (unaffected guard tests, confirming the gateway DTO changes didn't break existing coverage). `tsc --noEmit` clean for `apps/purchase-service` and `apps/api-gateway`. `ng build --configuration=development` for `apps/web` completed with no TypeScript/template errors (only pre-existing, unrelated Sass deprecation warnings). `git diff --check` reported no whitespace errors (only pre-existing LF/CRLF line-ending warnings). Manual browser verification was **not** performed in this session (Docker containers still serve the previous build) — see Known Limitations, same disclosure pattern as every prior implementation entry in this document.
- **Architectural decisions**: PO Number generation deliberately copies Sales' exact count-based-with-retry pattern rather than inventing a new numbering scheme, including knowingly preserving that pattern's pre-existing dead-code quirk (documented in the test itself) rather than "fixing" something Sales' own implementation already established as the convention. `buyerId` stores no name snapshot (plain UUID only), matching `SalesOrder.salespersonId`'s precedent — Angular resolves the display label client-side via `UserService`, not a server-side snapshot. `warehouseId` on `PurchaseOrder` was implemented as informational-only, explicitly never written to or read from `GoodsReceipt.warehouseId`, preserving Section 16's "these remain conceptually and technically distinct" rule. The conversion-factor validation hardening was implemented as a small defensive fix within already-approved Section 17 territory (line-level UOM resolution), not as an expansion into Section 19's GR-side conversion architecture.
- **Known limitations/technical debt**: Manual end-to-end browser verification (create/edit a PO with all new fields, confirm/cancel flows, cross-tenant isolation) has not been performed in this session — the currently running Docker containers still serve the previous build. No Goods Receipt V1 (Section 19) work was performed; Goods Receipt's existing compatibility contract (`PurchaseOrderItem.quantity`/`receivedQuantity`/`productId`) was verified unchanged and unaffected, not modified. No architectural conflict was discovered during implementation requiring escalation — none of the "STOP and report" conditions in the task instructions were triggered.
- **Anything deliberately NOT changed**: Purchase Invoice, Supplier Payment, Accounts Payable, Accounting journal posting (Section 22, Phases A–C) — untouched. Sales Invoice/Sales Payment (Sections 20–21) — untouched, reference-only as already established. Goods Receipt logic/schema (Section 19) — untouched. Currency/multi-currency — not introduced anywhere. `apps/sales-service/**`, `apps/inventory-service/**`, `apps/accounting-service/**` — untouched. `libs/common/src/rbac/permissions.ts` — no new permission constants needed, existing `PURCHASE_ORDERS_*` permissions already cover the expanded payload. PO V1's already-correct calculation pipeline (Section 18.5) — verified correct, not altered.
- **Commit hash**: `528b078` (`feat(purchase): add purchase order v1`)

<!-- Next entry goes here for the next Purchase-module change. -->

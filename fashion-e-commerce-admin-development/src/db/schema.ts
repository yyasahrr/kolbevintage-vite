import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// 1. Catalog Categories (Hierarchical)
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: integer("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
  description: text("description").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 2. Reusable Color Library
export const colorLibrary = pgTable("color_library", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hex: text("hex").notNull(),
  family: text("family").notNull(), // e.g. خنثی، گرم، سرد، خاکی
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// 3. Size Templates & Measurement Schemas
export const sizeTemplates = pgTable("size_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  categoryType: text("category_type").notNull(), // clothing | shoes | accessories
  sizesJson: jsonb("sizes_json").$type<string[]>().notNull(),
  measurementSchemaJson: jsonb("measurement_schema_json")
    .$type<string[]>()
    .notNull(),
  guideNotes: text("guide_notes").default(""),
});

// 4. Products (Core Catalog Entity)
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // e.g. KV-1042
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  categoryId: integer("category_id").references(() => categories.id),
  basePrice: integer("base_price").notNull().default(0), // Toman (IRT)
  status: text("status").notNull().default("draft"), // published | draft | needs_review | archived
  shortDescription: text("short_description").default(""),
  description: text("description").default(""),
  primaryImage: text("primary_image").default("/images/products/coat-camel.jpg"),
  sizeTemplateId: integer("size_template_id").references(
    () => sizeTemplates.id
  ),
  specificationsJson: jsonb("specifications_json")
    .$type<Record<string, string>>()
    .default({}),
  measurementsJson: jsonb("measurements_json")
    .$type<Record<string, Record<string, string>>>()
    .default({}),
  seoTitle: text("seo_title").default(""),
  seoDescription: text("seo_description").default(""),
  relatedProductIdsJson: jsonb("related_product_ids_json")
    .$type<number[]>()
    .default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 5. Explicit Color-Size Variants (NO forced Cartesian product)
export const productVariants = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  colorId: integer("color_id")
    .notNull()
    .references(() => colorLibrary.id),
  sizeLabel: text("size_label").notNull(),
  sku: text("sku").notNull().unique(),
  colorPriceOverride: integer("color_price_override"), // nullable Toman
  skuPriceOverride: integer("sku_price_override"), // nullable Toman
  // Tri-state direct discount: 'inherit' | 'none' | 'explicit'
  discountMode: text("discount_mode").notNull().default("inherit"),
  discountType: text("discount_type"), // 'percent' | 'fixed' | null
  discountValue: integer("discount_value"),
  // Authoritative inventory read-only mirror (mutated ONLY via warehouse ledger workflows)
  physicalStock: integer("physical_stock").notNull().default(0),
  reservedStock: integer("reserved_stock").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(4),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 6. Color-Dependent Product Media
export const productMedia = pgTable("product_media", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  colorId: integer("color_id")
    .notNull()
    .references(() => colorLibrary.id),
  mediaRole: text("media_role").notNull().default("gallery"), // main | gallery | hover | detail_video
  url: text("url").notNull(),
  altText: text("alt_text").default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

// 7. Curated Outfits / Styles
export const outfits = pgTable("outfits", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").default(""),
  heroImage: text("hero_image").default("/images/products/outfit-autumn.jpg"),
  // sum_of_items | look_discount_percent | fixed_look_price_pending_approval
  pricingMode: text("pricing_mode").notNull().default("sum_of_items"),
  lookDiscountPercent: integer("look_discount_percent").default(0),
  fixedLookPrice: integer("fixed_look_price"),
  status: text("status").notNull().default("draft"), // published | draft
  contractNote: text("contract_note").default(
    "رزرو موجودی در سطح SKU اقلام زیرمجموعه انجام می‌شود؛ مدل قیمت ثابت ست نیازمند تایید نهایی تیم مالی و کاتالوگ است."
  ),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const outfitItems = pgTable("outfit_items", {
  id: serial("id").primaryKey(),
  outfitId: integer("outfit_id")
    .notNull()
    .references(() => outfits.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  defaultVariantId: integer("default_variant_id").references(
    () => productVariants.id
  ),
  isRequired: boolean("is_required").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// 8. Authoritative Warehouse Ledger & Adjustments
export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  variantId: integer("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  // receive | order_reserve | order_pick | adjustment_in | adjustment_out | stocktake_reconcile | return_restock
  movementType: text("movement_type").notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  referenceCode: text("reference_code").notNull(),
  actorName: text("actor_name").notNull(),
  reason: text("reason").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryAdjustments = pgTable("inventory_adjustments", {
  id: serial("id").primaryKey(),
  variantId: integer("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  currentStock: integer("current_stock").notNull(),
  requestedDelta: integer("requested_delta").notNull(),
  reason: text("reason").notNull(),
  requesterName: text("requester_name").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewerName: text("reviewer_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
});

// 9. CRM Customers
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email").default(""),
  province: text("province").notNull().default("تهران"),
  city: text("city").notNull().default("تهران"),
  addressLine: text("address_line").notNull().default(""),
  postalCode: text("postal_code").default(""),
  building: text("building").default(""),
  unit: text("unit").default(""),
  status: text("status").notNull().default("active"), // active | vip | restricted
  marketingConsent: boolean("marketing_consent").notNull().default(true),
  smsUnsubscribed: boolean("sms_unsubscribed").notNull().default(false),
  tagsJson: jsonb("tags_json").$type<string[]>().default([]),
  sizeProfileJson: jsonb("size_profile_json")
    .$type<Record<string, string>>()
    .default({}),
  internalNotes: text("internal_notes").default(""),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
});

// 10. OMS Orders & Historical Snapshots
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(), // e.g. KV-40981
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  shippingProvince: text("shipping_province").notNull(),
  shippingCity: text("shipping_city").notNull(),
  shippingAddress: text("shipping_address").notNull(),
  postalCode: text("postal_code").default(""),
  recipientName: text("recipient_name").notNull(),
  subtotalAmount: integer("subtotal_amount").notNull(),
  discountAmount: integer("discount_amount").notNull().default(0),
  shippingAmount: integer("shipping_amount").notNull().default(0),
  totalAmount: integer("total_amount").notNull(),
  currencyUnit: text("currency_unit").notNull().default("IRT"),
  // unpaid | pending_verification | verified_paid | partially_refunded | refunded | failed
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paymentGateway: text("payment_gateway").notNull().default("zarinpal"),
  paymentRef: text("payment_ref").default(""),
  // new | awaiting_prep | picking | packing | ready_to_ship | shipped | delivered | cancelled | exception
  operationalStatus: text("operational_status").notNull().default("new"),
  shippingMethod: text("shipping_method").notNull().default("پست پیشتاز"),
  carrierName: text("carrier_name").default("شرکت ملی پست"),
  trackingCode: text("tracking_code").default(""),
  isManualOrder: boolean("is_manual_order").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id"),
  variantId: integer("variant_id"),
  productName: text("product_name").notNull(),
  colorName: text("color_name").notNull(),
  sizeLabel: text("size_label").notNull(),
  sku: text("sku").notNull(),
  quantity: integer("quantity").notNull(),
  pickedQuantity: integer("picked_quantity").notNull().default(0),
  packedQuantity: integer("packed_quantity").notNull().default(0),
  // Recorded historical prices (never recalculated from current catalog!)
  recordedUnitPrice: integer("recorded_unit_price").notNull(),
  recordedDiscountAmount: integer("recorded_discount_amount")
    .notNull()
    .default(0),
  recordedLineTotal: integer("recorded_line_total").notNull(),
});

export const orderEvents = pgTable("order_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  description: text("description").default(""),
  actorName: text("actor_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 11. Returns, QC & Refunds
export const returnRequests = pgTable("return_requests", {
  id: serial("id").primaryKey(),
  returnCode: text("return_code").notNull().unique(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  orderNumber: text("order_number").notNull(),
  orderItemId: integer("order_item_id")
    .notNull()
    .references(() => orderItems.id),
  sku: text("sku").notNull(),
  productName: text("product_name").notNull(),
  purchasedQty: integer("purchased_qty").notNull(),
  previouslyReturnedQty: integer("previously_returned_qty")
    .notNull()
    .default(0),
  requestedQty: integer("requested_qty").notNull(),
  reason: text("reason").notNull(),
  // requested | received | qc_passed | qc_failed | refund_pending_provider | refund_confirmed | exchanged
  status: text("status").notNull().default("requested"),
  qcNotes: text("qc_notes").default(""),
  refundProviderRef: text("refund_provider_ref").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 12. Campaigns & Promotions
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  promotionType: text("promotion_type").notNull().default("percent_off"), // percent_off | fixed_off | festival_bundle
  discountValue: integer("discount_value").notNull().default(0),
  // draft | scheduled | active | paused | expired | completed
  status: text("status").notNull().default("draft"),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  eligibleScope: text("eligible_scope").notNull().default("all"), // all | category | selected_skus
  eligibleCount: integer("eligible_count").notNull().default(0),
  maxCapacity: integer("max_capacity").default(500),
  usedCount: integer("used_count").notNull().default(0),
  perCustomerLimit: integer("per_customer_limit").default(1),
  stackingPolicyNote: text("stacking_policy_note").default(
    "ترکیب همزمان با تخفیف مستقیم SKU غیرفعال است (نیازمند مصوبه واحد تجاری)."
  ),
});

// 13. SMS Marketing & Delivery Records
export const smsCampaigns = pgTable("sms_campaigns", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  campaignType: text("campaign_type").notNull().default("promotional"), // promotional | selected_customers | birthday | reactivation | restock_alert
  targetSegment: text("target_segment").notNull(),
  templateText: text("template_text").notNull(),
  eligibleRecipientsCount: integer("eligible_recipients_count")
    .notNull()
    .default(0),
  suppressedUnsubscribedCount: integer("suppressed_unsubscribed_count")
    .notNull()
    .default(0),
  // draft | scheduled | dispatched_to_provider
  status: text("status").notNull().default("draft"),
  providerName: text("provider_name").notNull().default("کاوه‌نگار (Kavenegar)"),
  scheduledAt: timestamp("scheduled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const smsLogs = pgTable("sms_logs", {
  id: serial("id").primaryKey(),
  smsCampaignId: integer("sms_campaign_id").references(
    () => smsCampaigns.id,
    { onDelete: "set null" }
  ),
  campaignTitle: text("campaign_title").notNull(),
  recipientMasked: text("recipient_masked").notNull(),
  templatePreview: text("template_preview").notNull(),
  // accepted_by_provider | rejected_by_provider
  providerStatus: text("provider_status").notNull(),
  // pending_operator_dlr | delivered | failed_blocked
  deliveryStatus: text("delivery_status").notNull(),
  failureReason: text("failure_reason").default(""),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

// 14. Content (Blog & Video) + Customer Gallery + Style Packs
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  contentType: text("content_type").notNull().default("article"), // article | video_lookbook
  category: text("category").notNull().default("استایل و ترند"),
  authorName: text("author_name").notNull().default("تحریریه کلبه وینتیج"),
  status: text("status").notNull().default("draft"), // published | draft | scheduled
  featuredImage: text("featured_image").default(
    "/images/products/outfit-autumn.jpg"
  ),
  videoUrl: text("video_url").default(""),
  excerpt: text("excerpt").default(""),
  body: text("body").default(""),
  seoTitle: text("seo_title").default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const galleryItems = pgTable("gallery_items", {
  id: serial("id").primaryKey(),
  customerHandle: text("customer_handle").notNull(),
  imageUrl: text("image_url").notNull(),
  caption: text("caption").default(""),
  moderationStatus: text("moderation_status").notNull().default("pending"), // pending | approved | rejected
  consentVerified: boolean("consent_verified").notNull().default(true),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

export const stylePacks = pgTable("style_packs", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  persianName: text("persian_name").notNull(),
  aestheticCategory: text("aesthetic_category").notNull(),
  description: text("description").notNull(),
  primaryColor: text("primary_color").notNull(),
  surfaceColor: text("surface_color").notNull(),
  accentColor: text("accent_color").notNull(),
  fontPairing: text("font_pairing").notNull(),
  compatibleTemplatesJson: jsonb("compatible_templates_json")
    .$type<string[]>()
    .notNull(),
  isActive: boolean("is_active").notNull().default(false),
  version: text("version").notNull().default("1.0.0"),
});

// 15. Integrations, Sales Rules, Staff & Audit Logs
export const integrations = pgTable("integrations", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(), // payment | bnpl | sms | shipping | wms | crm | accounting
  // connected | pending_contract | error | disconnected
  connectionState: text("connection_state").notNull(),
  environment: text("environment").notNull().default("sandbox"), // production | sandbox | unconfigured
  lastSuccessAt: timestamp("last_success_at"),
  recentError: text("recent_error").default(""),
  configSummary: text("config_summary").default(""),
  isAuthoritativeSource: boolean("is_authoritative_source")
    .notNull()
    .default(false),
});

export const salesRules = pgTable("sales_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  scope: text("scope").notNull(), // storefront | payment | checkout | sku_limit | campaign | try_on
  currentValue: text("current_value").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  lastChangedBy: text("last_changed_by").notNull(),
  impactWarning: text("impact_warning").default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const staffMembers = pgTable("staff_members", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  // super_admin | catalog_manager | warehouse_operator | order_operator | marketing_manager | support_agent | finance_operator | content_designer
  roleKey: text("role_key").notNull(),
  roleTitle: text("role_title").notNull(),
  status: text("status").notNull().default("active"), // active | suspended
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorName: text("actor_name").notNull(),
  actorRole: text("actor_role").notNull(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  entityRef: text("entity_ref").notNull(),
  result: text("result").notNull().default("success"), // success | denied | warning
  referenceCode: text("reference_code").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

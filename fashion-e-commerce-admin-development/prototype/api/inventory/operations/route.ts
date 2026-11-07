import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  productVariants,
  inventoryMovements,
  inventoryAdjustments,
  auditLogs,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureSeeded();

  try {
    const body = await req.json();
    const operation = body?.operation;

    // 1. Receiving Goods (Warehouse Operator or Super Admin)
    if (operation === "receive") {
      const auth = await requireApiPermission(req, "inventory", "create");
      if (!auth.authorized) return auth.response;

      const variantId = Number(body?.variantId);
      const acceptedQty = Math.round(Number(body?.acceptedQty ?? 0));
      const rejectedQty = Math.max(0, Math.round(Number(body?.rejectedQty ?? 0)));
      const referenceCode =
        String(body?.referenceCode ?? "").trim() ||
        `RCV-${Date.now().toString().slice(-6)}`;
      const qcNote = String(body?.qcNote ?? "تایید سلامت در بارانداز انبار").trim();

      if (!variantId || acceptedQty <= 0) {
        return NextResponse.json(
          { error: "انتخاب کد SKU و تعداد تاییدشده بیشتر از صفر الزامی است." },
          { status: 400 }
        );
      }

      const [variant] = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, variantId));
      if (!variant) {
        return NextResponse.json({ error: "کد SKU یافت نشد" }, { status: 404 });
      }

      const nextPhysical = variant.physicalStock + acceptedQty;

      await db
        .update(productVariants)
        .set({ physicalStock: nextPhysical, updatedAt: new Date() })
        .where(eq(productVariants.id, variantId));

      await db.insert(inventoryMovements).values({
        variantId,
        sku: variant.sku,
        movementType: "receive",
        quantityDelta: acceptedQty,
        balanceAfter: nextPhysical,
        referenceCode,
        actorName: auth.actorName,
        reason: `${qcNote}${rejectedQty > 0 ? ` (${rejectedQty} عدد مردودی کنترل کیفیت)` : ""}`,
      });

      await db.insert(auditLogs).values({
        actorName: auth.actorName,
        actorRole: auth.role,
        module: "انبار",
        action: `ثبت رسید کالا (+${acceptedQty} عدد) برای ${variant.sku}`,
        entityRef: variant.sku,
        result: "success",
        referenceCode,
      });

      return NextResponse.json({
        ok: true,
        sku: variant.sku,
        newPhysicalStock: nextPhysical,
      });
    }

    // 2. Request Inventory Adjustment (requires manager approval before mutating stock!)
    if (operation === "request_adjustment") {
      const auth = await requireApiPermission(req, "inventory", "edit");
      if (!auth.authorized) return auth.response;

      const variantId = Number(body?.variantId);
      const requestedDelta = Math.round(Number(body?.requestedDelta ?? 0));
      const reason = String(body?.reason ?? "").trim();

      if (!variantId || requestedDelta === 0 || !reason) {
        return NextResponse.json(
          { error: "انتخاب SKU، مقدار تغییر غیرصفر و شرح دلیل الزامی است." },
          { status: 400 }
        );
      }

      const [variant] = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, variantId));
      if (!variant) {
        return NextResponse.json({ error: "کد SKU یافت نشد" }, { status: 404 });
      }

      if (variant.physicalStock + requestedDelta < variant.reservedStock) {
        return NextResponse.json(
          {
            error: `موجودی فیزیکی پس از کسر نمی‌تواند کمتر از موجودی رزروشده (${variant.reservedStock} عدد) باشد.`,
          },
          { status: 400 }
        );
      }

      const [created] = await db
        .insert(inventoryAdjustments)
        .values({
          variantId,
          sku: variant.sku,
          currentStock: variant.physicalStock,
          requestedDelta,
          reason,
          requesterName: auth.actorName,
          status: "pending",
        })
        .returning();

      return NextResponse.json({ adjustment: created }, { status: 201 });
    }

    // 3. Approve or Reject Inventory Adjustment (requires 'approve' permission!)
    if (operation === "review_adjustment") {
      const auth = await requireApiPermission(req, "inventory", "view");
      if (!auth.authorized) return auth.response;

      if (!hasPermission(auth.role, "inventory", "approve")) {
        return NextResponse.json(
          {
            error:
              "تایید نهایی اصلاح موجودی نیازمند مجوز سرپرست/مدیر (approve) است.",
          },
          { status: 403 }
        );
      }

      const adjustmentId = Number(body?.adjustmentId);
      const decision = body?.decision === "approved" ? "approved" : "rejected";

      const [adj] = await db
        .select()
        .from(inventoryAdjustments)
        .where(eq(inventoryAdjustments.id, adjustmentId));
      if (!adj || adj.status !== "pending") {
        return NextResponse.json(
          { error: "درخواست اصلاح معتبر یا در انتظار تایید یافت نشد." },
          { status: 400 }
        );
      }

      if (decision === "approved") {
        const [variant] = await db
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, adj.variantId));
        if (!variant) {
          return NextResponse.json({ error: "SKU یافت نشد" }, { status: 404 });
        }

        const nextPhysical = Math.max(
          variant.reservedStock,
          variant.physicalStock + adj.requestedDelta
        );

        await db
          .update(productVariants)
          .set({ physicalStock: nextPhysical, updatedAt: new Date() })
          .where(eq(productVariants.id, variant.id));

        await db.insert(inventoryMovements).values({
          variantId: variant.id,
          sku: variant.sku,
          movementType:
            adj.requestedDelta >= 0 ? "adjustment_in" : "adjustment_out",
          quantityDelta: adj.requestedDelta,
          balanceAfter: nextPhysical,
          referenceCode: `ADJ-${adj.id}`,
          actorName: auth.actorName,
          reason: `تایید اصلاح موجودی: ${adj.reason}`,
        });
      }

      const [updatedAdj] = await db
        .update(inventoryAdjustments)
        .set({
          status: decision,
          reviewerName: auth.actorName,
          reviewedAt: new Date(),
        })
        .where(eq(inventoryAdjustments.id, adjustmentId))
        .returning();

      return NextResponse.json({ adjustment: updatedAdj });
    }

    // 4. Stocktake Reconcile
    if (operation === "stocktake_reconcile") {
      const auth = await requireApiPermission(req, "inventory", "edit");
      if (!auth.authorized) return auth.response;

      const variantId = Number(body?.variantId);
      const countedQty = Math.max(0, Math.round(Number(body?.countedQty ?? 0)));
      const sessionCode =
        String(body?.sessionCode ?? "").trim() ||
        `STK-${Date.now().toString().slice(-5)}`;

      const [variant] = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, variantId));
      if (!variant) {
        return NextResponse.json({ error: "کد SKU یافت نشد" }, { status: 404 });
      }

      if (countedQty < variant.reservedStock) {
        return NextResponse.json(
          {
            error: `شمارش واقعی (${countedQty}) از تعداد رزروشده سفارش‌ها (${variant.reservedStock}) کمتر است؛ نیازمند بررسی مغایرت سفارش است.`,
          },
          { status: 400 }
        );
      }

      const delta = countedQty - variant.physicalStock;
      await db
        .update(productVariants)
        .set({ physicalStock: countedQty, updatedAt: new Date() })
        .where(eq(productVariants.id, variantId));

      await db.insert(inventoryMovements).values({
        variantId,
        sku: variant.sku,
        movementType: "stocktake_reconcile",
        quantityDelta: delta,
        balanceAfter: countedQty,
        referenceCode: sessionCode,
        actorName: auth.actorName,
        reason: `ثبت شمارش فیزیکی انبار (موجودی قبلی: ${variant.physicalStock}، شمارش: ${countedQty})`,
      });

      return NextResponse.json({
        ok: true,
        sku: variant.sku,
        delta,
        newPhysicalStock: countedQty,
      });
    }

    return NextResponse.json({ error: "عملیات انبار نامعتبر است" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در ثبت تراکنش دفتر کل انبار", detail: String(err) },
      { status: 500 }
    );
  }
}

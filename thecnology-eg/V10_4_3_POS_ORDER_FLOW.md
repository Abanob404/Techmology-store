# Technology Store V10.4.3 — POS Authoritative Order Flow

## القاعدة الأساسية

Technology POS هو المصدر الوحيد للمخزون والبيع والفاتورة وحالة الدفع.
الموقع يعرض المنتجات والكميات القادمة من POS ويستقبل طلب العميل فقط.
إنشاء طلب من الموقع لا يخصم ولا يحجز ولا يرجع أي كمية.

## مسار المخزون

1. POS يرسل السعر والكمية إلى:
   `POST /api/pos/products/sync`
2. الموقع يعرض الكمية فقط.
3. قبل إضافة المنتج أو زيادة كميته في السلة، الموقع يراجع الكمية الحالية عبر:
   `GET /api/products/:id/availability`
4. عند إرسال الطلب، السيرفر يعمل فحص أخير للكمية الحالية.
5. لا يوجد أي خصم من المخزون بسبب Order من الموقع.
6. بعد حفظ فاتورة البيع في POS، POS يخصم مخزونه بالطريقة المعتادة ثم يرسل الكمية الجديدة للموقع في المزامنة التالية.

## مسار الطلب

### 1) الموقع ينشئ طلباً فقط

`POST /api/orders`

الحالة الأولى:
- `status = pending`
- `paymentStatus = pending`
- `posInvoiceId = ""`

رسالة العميل: تم استلام الطلب وفي انتظار تأكيد المتجر / إنشاء فاتورة Technology POS.

### 2) POS يسحب الطلبات التي لم تتحول لفاتورة

`GET /api/pos/orders`

بدون status، الـ API يرجع افتراضياً الطلبات المنتظرة للفاتورة (`pending` و `received_by_pos`) والتي ليس لها `posInvoiceId`.

يمكن للـ POS اختيارياً تسجيل أن الطلب وصل له بدون اعتباره بيعاً:

```http
PUT /api/pos/orders/:orderId/status
Content-Type: application/json
x-pos-api-key: ...

{
  "status": "received_by_pos",
  "note": "تم استلام الطلب داخل البرنامج"
}
```

هذا لا يخصم مخزون ولا ينشئ بيعاً.

### 3) عند حفظ فاتورة البيع فعلياً في Technology POS

يفضل استخدام المسار المخصص:

```http
POST /api/pos/orders/:orderId/invoice
Content-Type: application/json
x-pos-api-key: ...

{
  "posInvoiceId": "INV-15482",
  "paymentStatus": "paid",
  "note": "تم إنشاء وحفظ فاتورة البيع"
}
```

قيم `paymentStatus`:
- `pending` = في انتظار تأكيد الدفع
- `reserved` = تم حجز الطلب
- `paid` = تم الدفع
- `cash_on_delivery` = الدفع عند الاستلام
- `cancelled` = تم إلغاء الدفع
- `refunded` = تم رد المبلغ

بعد نجاح هذا الطلب:
- `status = confirmed`
- يظهر رقم فاتورة POS للعميل.
- يظهر وضع الدفع للعميل.
- يبدأ الطلب فقط من هذه اللحظة في تقارير المبيعات والإيراد بالموقع.
- الكوبون يحتسب كمستخدم فقط بعد إنشاء فاتورة POS.
- لا يتم تغيير المخزون من الموقع؛ POS يرسل الكمية الجديدة عبر مزامنة المنتجات.

### 4) حالات التنفيذ بعد الفاتورة

```http
PUT /api/pos/orders/:orderId/status
Content-Type: application/json
x-pos-api-key: ...

{
  "status": "processing",
  "paymentStatus": "paid",
  "note": "جاري تجهيز الطلب"
}
```

الحالات المتاحة:
- `pending`
- `received_by_pos`
- `confirmed`
- `processing`
- `out_for_delivery`
- `completed`
- `cancelled`

الحالات `confirmed / processing / out_for_delivery / completed` لا تقبل بدون فاتورة POS حقيقية.

## الإلغاء

- قبل الفاتورة: يمكن إلغاء الطلب لأنه مجرد Request ولم تحدث حركة مخزون.
- بعد الفاتورة: الإلغاء/المرتجع يجب أن يبدأ داخل Technology POS أولاً حتى ترجع حركة المخزون والحسابات بشكل صحيح، ثم POS يحدث حالة الموقع.
- لوحة إدارة الموقع تمنع إلغاء طلب له فاتورة POS.

## حماية إضافية

- الطلب لا يعتبر Purchase في Meta/Analytics بمجرد إرساله من الموقع؛ يسجل كـ Lead / Order Submitted.
- Revenue وتقارير المبيعات تعتمد على وجود `posInvoiceId` حقيقي.
- طباعة الفاتورة وخيارات الاستبدال/الاسترجاع لا تظهر للعميل قبل وجود فاتورة POS.
- لا يمكن ربط الطلب بفواتير POS مختلفة بعد ربطه بأول فاتورة.
- الطلب الملغي قبل البيع لا يمكن إصدار فاتورة له من API.

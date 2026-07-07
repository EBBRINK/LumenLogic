# XIS POST API — attribute list for Lynx Solutions

> Deliverable for the open Lynx task ("come back with a set of attributes for the
> product upload endpoint", Alpár Kacso, 2026-06-24). In English so it can be pasted
> into the task/mail directly. Field codes reference the XIS modules where known
> (A/B/E codes as used in XIS today). Two endpoints are needed; **Projects first** —
> that is the one our estimate workflow touches daily.

---

## 1. POST /projects (quotations) — priority 1

Create a project (quotation) in XIS with its lines, from an external system.

### Project header

| attribute | type | required | notes |
|---|---|---|---|
| name | string | yes | project name |
| customer_reference | string | no | customer name or XIS customer id — please advise which XIS expects |
| external_reference | string | yes | our dossier id (idempotency: same reference must not create a duplicate project) |
| quote_number | string | no | if XIS assigns its own numbering, return it in the response |
| date | date | yes | |
| notes | string | no | free text |

### Project lines (array)

| attribute | type | required | notes |
|---|---|---|---|
| fixture_code | string | yes | spec reference from the armaturenboek, e.g. "Lp301" — must be visible on the line |
| product_ref | string | yes* | XIS article code (A1) or product id; *see open question 3 for products not yet in XIS |
| quantity | integer | yes | |
| unit_price_excl_vat | number | no | if omitted, XIS applies its own current price — please confirm this behaviour |
| description | string | no | line-level free text (e.g. requested spec summary) |
| zone | string | no | room/zone grouping, if projects support grouping or sub-totals |
| sort_order | integer | yes | lines must keep the order we send (spec order, never resorted) |

### Expected response

Project id + quote number + per-line ids, so we can link back and update later.

---

## 2. POST /products — priority 2

Create (or update, see open question 1) a product in XIS. Attributes in two groups;
**we would like the endpoint to accept both groups from day one.**

### Tier 1 — base data

| attribute | XIS code | type | required |
|---|---|---|---|
| article_code | A1 | string | no (XIS may auto-generate from brand_code + supplier_article_code) |
| name | | string | yes |
| brand_code | | string | yes |
| supplier_article_code | | string | yes |
| category | | string/id | no — full path ("Hoofd >> Sub >> Subsub") or category id, please advise |
| selling_price_excl_vat | | number | yes |
| purchase_price_excl_vat | B2 | number | no (XIS may derive from brand discount) |
| status | | string | no, default "actief" |
| valid_from / valid_until | | date | no |
| source_list / source_list_date | | string / date | no — provenance of the price |
| supplier_code | | string | no |

### Tier 2 — specification data

| attribute | XIS code | type |
|---|---|---|
| description | A4 | string |
| height_cm / width_cm / length_cm / diameter_cm | E1–E4 | number |
| color_1 | E9 | string |
| material_1 | E10 | string |
| light_source | E13 | string |
| max_wattage | E14 | number |
| light_source_system | E15 | string |
| light_source_included | E16 | boolean |
| lamp_foot | E17 | string |
| lamp_category | E18 | string |
| kelvin | E19 | integer |
| lumen_output | E20 | integer |
| cri | E21 | integer |
| beam_angle | E22 | number |
| dimmable | E23 | string (e.g. "DALI") |
| ip_value | E24 | string |
| driver_included | E26 | string |
| directionable | E27 | boolean |

---

## 3. Open questions for Lynx (for today's call)

1. **Create vs update**: is POST create-only, or upsert on article_code? We need at
   least "reject duplicates with a clear error" so re-sending is safe.
2. **Batching**: one product/project per call, or arrays? Our typical upload is
   1 project with 10–100 lines, and occasionally a batch of new products for one brand.
3. **Products inside a project**: can a project line reference a product created in the
   same request/batch, or must products exist first (two-step flow)?
4. **Test environment**: a sandbox XIS + separate API key before anything touches
   production — also addresses the safety concern from the 24 June mail.
5. **API key scoping**: can a key be limited to these two endpoints only, with rate
   limits, so a leaked key cannot mass-modify other data?
6. **Response contract**: ids + validation errors per line/attribute (not just
   accept/reject of the whole payload).
7. **Quotations endpoint on the task**: the current task mentions product upload —
   please confirm the projects/quotations POST is added to the same task.

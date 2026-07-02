CREATE TYPE "public"."disclosure_tier" AS ENUM('tier1', 'tier2', 'tier3');--> statement-breakpoint
CREATE TYPE "public"."dossier_phase" AS ENUM('tender', 'awarded');--> statement-breakpoint
CREATE TYPE "public"."spec_line_status" AS ENUM('open', 'matched', 'no_match');--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_code" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"country" text,
	"disclosure_tier" "disclosure_tier" DEFAULT 'tier1' NOT NULL,
	"description_nl" text,
	"warranty" text,
	"rating" text,
	"standard_discount_pct" numeric(6, 2),
	"base_discount_pct" numeric(6, 2),
	"payment_term_days" integer,
	"delivery_time_days" integer,
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name_nl" text NOT NULL,
	"name_en" text,
	"parent_id" uuid,
	"level" integer NOT NULL,
	"display_order" integer,
	"full_path_nl" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"action" text NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"gross_price" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"article_code" text,
	"name" text NOT NULL,
	"brand_id" uuid,
	"brand_name" text,
	"supplier_article_code" text,
	"category_id" uuid,
	"category_path" text,
	"supplier_id" uuid,
	"supplier_name" text,
	"status" text DEFAULT 'actief' NOT NULL,
	"description" text,
	"lumen_output" integer,
	"max_wattage" numeric(8, 2),
	"kelvin" integer,
	"cri" smallint,
	"ip_value" text,
	"beam_angle" numeric(6, 2),
	"dimmable" text,
	"driver_included" text,
	"light_source" text,
	"directionable" boolean,
	"height_cm" numeric(8, 2),
	"width_cm" numeric(8, 2),
	"length_cm" numeric(8, 2),
	"diameter_cm" numeric(8, 2),
	"color_1" text,
	"material_1" text,
	"warranty_months" integer,
	"repairability" text,
	"epd_lifetime_hours" integer,
	"country_of_origin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_dossiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"customer" text,
	"phase" "dossier_phase" DEFAULT 'tender' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"spec_line_id" uuid,
	"product_id" uuid,
	"product_name" text NOT NULL,
	"fixture_code" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dossier_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spec_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dossier_id" uuid NOT NULL,
	"fixture_code" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"description" text,
	"brand_text" text,
	"product_text" text,
	"req_kelvin" integer,
	"req_cri" integer,
	"req_ip" text,
	"matched_product_id" uuid,
	"status" "spec_line_status" DEFAULT 'open' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supplier_code" text,
	"name" text NOT NULL,
	"country" text,
	"city" text,
	"contact_email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_spec_line_id_spec_lines_id_fk" FOREIGN KEY ("spec_line_id") REFERENCES "public"."spec_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_dossier_id_project_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."project_dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_lines" ADD CONSTRAINT "spec_lines_dossier_id_project_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."project_dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_lines" ADD CONSTRAINT "spec_lines_matched_product_id_products_id_fk" FOREIGN KEY ("matched_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_lists_brand_uniq" ON "price_lists" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prices_product_list_uniq" ON "prices" USING btree ("product_id","price_list_id");
CREATE TABLE IF NOT EXISTS "day_plans" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "plan_date" date NOT NULL DEFAULT CURRENT_DATE,
    "completed" boolean NOT NULL DEFAULT false,
    "completed_at" timestamp with time zone,
    "google_sheet_url" text,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Trigger for updated_at
CREATE TRIGGER update_day_plans_updated_at
BEFORE UPDATE ON "day_plans"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

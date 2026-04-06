import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side route using service role key to bypass RLS
// Code tables are read-only shared reference data
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } }
);

let cache: { codeValues: unknown[]; accRels: unknown[]; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET() {
  // Return from cache if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache);
  }

  const [cvRes, arRes] = await Promise.all([
    supabase
      .from("codevalue")
      .select("cv_id, cs_id, cv_name, cv_order, cv_etc, cv_etc2")
      .order("cv_order"),
    supabase.from("acc_rel").select("*").eq("input_yn", "Y").order("acc_order"),
  ]);

  cache = {
    codeValues: cvRes.data || [],
    accRels: arRes.data || [],
    ts: Date.now(),
  };

  return NextResponse.json(cache);
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, table, data, filters, id, admin_session } = await req.json();

    if (!action || !table) {
      return new Response(
        JSON.stringify({ error: "Missing action or table" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Whitelist of allowed tables
    const ALLOWED_TABLES = [
      'products', 'categories', 'orders', 'users', 'banners',
      'delivery_zones', 'coupons', 'coupon_usage', 'returns',
      'reviews', 'audit_log', 'admin_accounts', 'product_collections',
      'promotions', 'favorites', 'notifications', 'product_relations',
    ];
    if (!ALLOWED_TABLES.includes(table)) {
      return new Response(
        JSON.stringify({ error: "Table not allowed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorization: mutations on sensitive tables require valid admin session
    const SENSITIVE_TABLES = ["admin_accounts", "audit_log", "notifications"];
    const MUTATION_ACTIONS = ["insert", "update", "delete", "updateOrderStatus"];
    if (MUTATION_ACTIONS.includes(action) && SENSITIVE_TABLES.includes(table)) {
      if (!admin_session) {
        return new Response(
          JSON.stringify({ error: "Admin session required for this operation" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Verify admin session token
      const { data: adminAccount } = await supabase
        .from("admin_accounts")
        .select("id, is_active")
        .eq("id", admin_session.admin_id)
        .eq("session_token", admin_session.token_hash)
        .eq("is_active", true)
        .maybeSingle();
      if (!adminAccount) {
        return new Response(
          JSON.stringify({ error: "Invalid admin session" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    let result;

    switch (action) {
      case "select": {
        let query = supabase.from(table).select(data || "*");
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value !== null) {
              query = query.eq(key, value);
            }
          }
        }
        if (table === "orders") {
          query = query.order("created_at", { ascending: false }).range(0, 199);
        } else if (table === "audit_log") {
          query = query.order("created_at", { ascending: false }).limit(100);
        } else {
          query = query.range(0, 499);
        }
        const { data: rows, error } = await query;
        if (error) throw error;
        result = rows;
        break;
      }

      case "insert": {
        const { data: inserted, error } = await supabase
          .from(table)
          .insert(data)
          .select()
          .single();
        if (error) throw error;
        result = inserted;
        break;
      }

      case "update": {
        if (id === "__bulk__" && filters) {
          let query = supabase
            .from(table)
            .update({ ...data, updated_at: new Date().toISOString() });
          for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value !== null) {
              query = query.eq(key, value);
            }
          }
          const { error } = await query;
          if (error) throw error;
          result = { success: true };
        } else {
          if (!id) throw new Error("ID required for update");
          const { data: updated, error } = await supabase
            .from(table)
            .update({ ...data, updated_at: new Date().toISOString() })
            .eq("id", id)
            .select()
            .single();
          if (error) throw error;
          result = updated;
        }
        break;
      }

      case "delete": {
        if (id === "__filter__" && filters) {
          let query = supabase.from(table).delete();
          for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value !== null) {
              query = query.eq(key, value);
            }
          }
          const { error } = await query;
          if (error) throw error;
        } else {
          if (!id) throw new Error("ID required for delete");
          const { error } = await supabase
            .from(table)
            .delete()
            .eq("id", id);
          if (error) throw error;
        }
        result = { success: true };
        break;
      }

      case "updateOrderStatus": {
        if (!id) throw new Error("ID required");
        const { status, changed_by } = data;
        const { data: order, error: fetchErr } = await supabase
          .from("orders")
          .select("status_history, telegram_user_id")
          .eq("id", id)
          .maybeSingle();
        if (fetchErr) throw fetchErr;

        const history = Array.isArray(order?.status_history) ? order.status_history : [];
        const newEntry = {
          status,
          changed_at: new Date().toISOString(),
          changed_by: changed_by || "Admin",
        };

        const { data: updatedOrder, error: updateErr } = await supabase
          .from("orders")
          .update({
            status,
            status_history: [...history, newEntry],
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();
        if (updateErr) throw updateErr;

        if (order?.telegram_user_id) {
          const STATUS_LABELS = {
            new: "Новый", processing: "В обработке", assembling: "В сборке",
            assembled: "Собран", shipping: "В доставке", delivered: "Доставлен",
            cancelled: "Отменён", return_requested: "Возврат", returned: "Возвращён",
          };
          await supabase.from("notifications").insert({
            telegram_user_id: order.telegram_user_id,
            type: `order_${status}`,
            title: `Заказ #${id.slice(0, 8).toUpperCase()}`,
            body: `Статус изменён: ${STATUS_LABELS[status] || status}`,
            data: { order_id: id, status },
          }).catch(() => {});
        }

        result = updatedOrder;
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Admin API error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

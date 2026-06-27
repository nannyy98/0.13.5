const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function adminApiCall(action: string, table: string, params?: {
  data?: unknown;
  filters?: Record<string, unknown>;
  id?: string;
  retries?: number;
}) {
  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase not configured');
  }

  const maxRetries = params?.retries ?? 1;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/admin-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'Apikey': anonKey,
        },
        body: JSON.stringify({ action, table, ...params }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Admin API error');
      }

      const result = await response.json();
      return result.data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

export const adminQueries = {
  // Orders
  getOrders: async () => {
    return adminApiCall('select', 'orders');
  },

  updateOrderStatus: async (orderId: string, status: string, changedBy: string) => {
    return adminApiCall('updateOrderStatus', 'orders', {
      id: orderId,
      data: { status, changed_by: changedBy },
    });
  },

  // Products
  getProducts: async () => {
    return adminApiCall('select', 'products');
  },

  createProduct: async (product: Record<string, unknown>) => {
    return adminApiCall('insert', 'products', { data: product });
  },

  updateProduct: async (id: string, updates: Record<string, unknown>) => {
    return adminApiCall('update', 'products', { id, data: updates });
  },

  deleteProduct: async (id: string) => {
    return adminApiCall('delete', 'products', { id });
  },

  // Banners
  getBanners: async () => {
    return adminApiCall('select', 'banners');
  },

  createBanner: async (banner: Record<string, unknown>) => {
    return adminApiCall('insert', 'banners', { data: banner });
  },

  updateBanner: async (id: string, updates: Record<string, unknown>) => {
    return adminApiCall('update', 'banners', { id, data: updates });
  },

  deleteBanner: async (id: string) => {
    return adminApiCall('delete', 'banners', { id });
  },

  // Delivery Zones
  getDeliveryZones: async () => {
    return adminApiCall('select', 'delivery_zones');
  },

  createDeliveryZone: async (zone: Record<string, unknown>) => {
    return adminApiCall('insert', 'delivery_zones', { data: zone });
  },

  updateDeliveryZone: async (id: string, updates: Record<string, unknown>) => {
    return adminApiCall('update', 'delivery_zones', { id, data: updates });
  },

  deleteDeliveryZone: async (id: string) => {
    return adminApiCall('delete', 'delivery_zones', { id });
  },

  // Coupons
  getCoupons: async () => {
    return adminApiCall('select', 'coupons');
  },

  createCoupon: async (coupon: Record<string, unknown>) => {
    return adminApiCall('insert', 'coupons', { data: coupon });
  },

  updateCoupon: async (id: string, updates: Record<string, unknown>) => {
    return adminApiCall('update', 'coupons', { id, data: updates });
  },

  deleteCoupon: async (id: string) => {
    return adminApiCall('delete', 'coupons', { id });
  },

  recordCouponUsage: async (couponId: string, telegramUserId: number, orderId?: string) => {
    return adminApiCall('insert', 'coupon_usage', { data: { coupon_id: couponId, telegram_user_id: telegramUserId, order_id: orderId ?? null } });
  },

  // Returns
  getReturns: async () => {
    return adminApiCall('select', 'returns');
  },

  updateReturnStatus: async (id: string, updates: Record<string, unknown>) => {
    return adminApiCall('update', 'returns', { id, data: updates });
  },

  createReturn: async (data: Record<string, unknown>) => {
    return adminApiCall('insert', 'returns', { data });
  },

  // Users
  getUsers: async () => {
    return adminApiCall('select', 'users');
  },

  // Audit Log
  getAuditLog: async () => {
    return adminApiCall('select', 'audit_log');
  },

  // Admin Accounts
  getAdminAccounts: async () => {
    return adminApiCall('select', 'admin_accounts');
  },

  createAdminAccount: async (account: Record<string, unknown>) => {
    return adminApiCall('insert', 'admin_accounts', { data: account });
  },

  updateAdminAccount: async (id: string, updates: Record<string, unknown>) => {
    return adminApiCall('update', 'admin_accounts', { id, data: updates });
  },

  // Product Collections
  getCollections: async () => {
    return adminApiCall('select', 'product_collections');
  },

  createCollection: async (collection: Record<string, unknown>) => {
    return adminApiCall('insert', 'product_collections', { data: collection });
  },

  updateCollection: async (id: string, updates: Record<string, unknown>) => {
    return adminApiCall('update', 'product_collections', { id, data: updates });
  },

  deleteCollection: async (id: string) => {
    return adminApiCall('delete', 'product_collections', { id });
  },

  // Reviews
  getReviews: async () => {
    return adminApiCall('select', 'reviews');
  },

  updateReview: async (id: string, updates: Record<string, unknown>) => {
    return adminApiCall('update', 'reviews', { id, data: updates });
  },

  // Categories
  getCategories: async () => {
    return adminApiCall('select', 'categories');
  },

  createCategory: async (category: Record<string, unknown>) => {
    return adminApiCall('insert', 'categories', { data: category });
  },

  updateCategory: async (id: string, updates: Record<string, unknown>) => {
    return adminApiCall('update', 'categories', { id, data: updates });
  },

  deleteCategory: async (id: string) => {
    return adminApiCall('delete', 'categories', { id });
  },

  // Audit Log
  getAuditLogFiltered: async (filters?: Record<string, unknown>) => {
    return adminApiCall('select', 'audit_log', { filters });
  },

  insertAuditLog: async (entry: Record<string, unknown>) => {
    return adminApiCall('insert', 'audit_log', { data: entry });
  },

  // Users (registration & profile — routed through edge function for security)
  upsertUser: async (data: Record<string, unknown>) => {
    return adminApiCall('insert', 'users', { data });
  },

  updateUser: async (id: string, updates: Record<string, unknown>) => {
    return adminApiCall('update', 'users', { id, data: updates });
  },

  // Favorites
  addFavorite: async (data: Record<string, unknown>) => {
    return adminApiCall('insert', 'favorites', { data });
  },

  removeFavorite: async (filters: Record<string, unknown> | string) => {
    if (typeof filters === 'string') {
      return adminApiCall('delete', 'favorites', { id: filters });
    }
    return adminApiCall('delete', 'favorites', { id: '__filter__', data: filters });
  },

  getFavorites: async (filters: Record<string, unknown>) => {
    return adminApiCall('select', 'favorites', { filters });
  },

  // Reviews (customer creation + admin moderation)
  createReview: async (data: Record<string, unknown>) => {
    return adminApiCall('insert', 'reviews', { data });
  },

  approveReview: async (id: string) => {
    return adminApiCall('update', 'reviews', { id, data: { is_approved: true } });
  },

  rejectReview: async (id: string) => {
    return adminApiCall('update', 'reviews', { id, data: { is_approved: false } });
  },

  replyToReview: async (id: string, reply: string) => {
    return adminApiCall('update', 'reviews', { id, data: { admin_reply: reply } });
  },

  // Referrals
  createReferral: async (data: Record<string, unknown>) => {
    return adminApiCall('insert', 'referrals', { data });
  },

  updateReferral: async (id: string, updates: Record<string, unknown>) => {
    return adminApiCall('update', 'referrals', { id, data: updates });
  },

  getReferrals: async (filters?: Record<string, unknown>) => {
    return adminApiCall('select', 'referrals', { filters });
  },

  // Notifications
  markNotificationRead: async (id: string) => {
    return adminApiCall('update', 'notifications', { id, data: { is_read: true } });
  },

  markAllNotificationsRead: async (filters: Record<string, unknown>) => {
    return adminApiCall('update', 'notifications', { id: '__bulk__', data: { is_read: true }, filters });
  },

  getNotifications: async (filters?: Record<string, unknown>) => {
    return adminApiCall('select', 'notifications', { filters });
  },

  createNotification: async (data: Record<string, unknown>) => {
    return adminApiCall('insert', 'notifications', { data });
  },

  // Product Relations
  createProductRelation: async (data: Record<string, unknown>) => {
    return adminApiCall('insert', 'product_relations', { data });
  },

  deleteProductRelation: async (id: string) => {
    return adminApiCall('delete', 'product_relations', { id });
  },

  getProductRelations: async (filters?: Record<string, unknown>) => {
    return adminApiCall('select', 'product_relations', { filters });
  },

  // Orders (filtered read for customer order history)
  getOrdersFiltered: async (filters?: Record<string, unknown>) => {
    return adminApiCall('select', 'orders', { filters });
  },

  // Returns (customer creation)
  getReturnsFiltered: async (filters?: Record<string, unknown>) => {
    return adminApiCall('select', 'returns', { filters });
  },

  // Coupon usage reads
  getCouponUsage: async (filters?: Record<string, unknown>) => {
    return adminApiCall('select', 'coupon_usage', { filters });
  },
};

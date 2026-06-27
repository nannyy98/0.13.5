import { supabase, isSupabaseConfigured, Database } from '../supabase';
import { adminQueries } from '../adminApi';
import {
  mockProducts, mockCategories, mockOrders, mockBanners, mockDeliveryZones,
} from './mock';

export type Product = Database['public']['Tables']['products']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type Review = Database['public']['Tables']['reviews']['Row'];
export type Promotion = Database['public']['Tables']['promotions']['Row'];
export type Referral = Database['public']['Tables']['referrals']['Row'];

export interface ProductFilters {
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  sizes?: string[];
  colors?: string[];
  inStock?: boolean;
  search?: string;
}

export interface ProductSort {
  field: 'created_at' | 'price' | 'views';
  order: 'asc' | 'desc';
}

export const PAGE_SIZE = 20;

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

export const productQueries = {
  getAll: async (filters?: ProductFilters, sort?: ProductSort, offset = 0, limit = PAGE_SIZE) => {
    if (!isSupabaseConfigured) {
      await delay();
      let items = [...mockProducts].filter((p) => p.is_active);
      if (filters?.categoryId) items = items.filter((p) => p.category_id === filters.categoryId);
      if (filters?.minPrice !== undefined) items = items.filter((p) => p.price >= filters.minPrice!);
      if (filters?.maxPrice !== undefined) items = items.filter((p) => p.price <= filters.maxPrice!);
      if (filters?.inStock) items = items.filter((p) => p.stock > 0);
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        items = items.filter((p) => p.name.ru.toLowerCase().includes(q) || p.name.uz.toLowerCase().includes(q));
      }
      if (filters?.sizes?.length) items = items.filter((p) => p.sizes.some((s) => filters.sizes!.includes(s)));
      if (filters?.colors?.length) items = items.filter((p) => p.colors.some((c) => filters.colors!.includes(c.hex)));
      if (sort) items.sort((a, b) => sort.order === 'asc' ? (a[sort.field] as number) - (b[sort.field] as number) : (b[sort.field] as number) - (a[sort.field] as number));
      return { items: items.slice(offset, offset + limit), total: items.length };
    }

    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    if (filters?.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }

    if (filters?.minPrice !== undefined) {
      query = query.gte('price', filters.minPrice);
    }

    if (filters?.maxPrice !== undefined) {
      query = query.lte('price', filters.maxPrice);
    }

    if (filters?.search && filters.search.trim().length > 0) {
      const sanitized = filters.search.replace(/[%_()]/g, '\\$&');
      query = query.or(`name->ru.ilike.%${sanitized}%,name->uz.ilike.%${sanitized}%,description->ru.ilike.%${sanitized}%,description->uz.ilike.%${sanitized}%`);
    }

    if (filters?.inStock) {
      query = query.gt('stock', 0);
    }

    if (sort) {
      query = query.order(sort.field, { ascending: sort.order === 'asc' });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    let filteredData = data || [];

    if (filters?.sizes && filters.sizes.length > 0) {
      filteredData = filteredData.filter(product =>
        product.sizes.some((size: string) => filters.sizes!.includes(size))
      );
    }

    if (filters?.colors && filters.colors.length > 0) {
      filteredData = filteredData.filter(product =>
        product.colors.some((color: { name: string; hex: string }) => filters.colors!.includes(color.hex))
      );
    }

    return { items: filteredData, total: count ?? 0 };
  },

  getBySlug: async (slug: string) => {
    if (!isSupabaseConfigured) {
      await delay();
      return mockProducts.find((p) => p.slug === slug) ?? null;
    }
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  incrementViews: async (id: string) => {
    if (!isSupabaseConfigured) return;
    await supabase.rpc('increment_views', { p_id: id });
  },

  uploadImages: async (files: File[]) => {
    if (!isSupabaseConfigured) return files.map(() => 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80');
    const uploadPromises = files.map(async (file) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      return publicUrl;
    });

    return Promise.all(uploadPromises);
  },
};

export const inventoryQueries = {
  updateStock: async (productId: string, newStock: number) => {
    if (!isSupabaseConfigured) { await delay(); const p = mockProducts.find((p) => p.id === productId); if (p) p.stock = newStock; return { id: productId, stock: newStock }; }
    const data = await adminQueries.updateProduct(productId, { stock: newStock, updated_at: new Date().toISOString() });
    return { id: productId, stock: data.stock };
  },

  adjustStock: async (productId: string, delta: number) => {
    if (!isSupabaseConfigured) {
      await delay();
      const p = mockProducts.find((p) => p.id === productId);
      if (p) p.stock = Math.max(0, p.stock + delta);
      return { id: productId, stock: p?.stock ?? 0 };
    }
    const product = await adminQueries.getProducts();
    const p = (product as Array<{ id: string; stock: number }>).find((p) => p.id === productId);
    const newStock = Math.max(0, (p?.stock ?? 0) + delta);
    const updated = await adminQueries.updateProduct(productId, { stock: newStock, updated_at: new Date().toISOString() });
    return { id: productId, stock: updated.stock };
  },

  getAllWithStock: async () => {
    if (!isSupabaseConfigured) { await delay(); return mockProducts; }
    const { data, error } = await supabase
      .from('products')
      .select('id, name, slug, price, stock, images, is_active, category_id')
      .order('stock', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
};

export type User = Database['public']['Tables']['users']['Row'];

export const userQueries = {
  getByTelegramId: async (telegramId: number) => {
    if (!isSupabaseConfigured) { await delay(); return { id: `${telegramId}`, telegram_id: telegramId, first_name: 'Гость', username: null, language: 'ru', phone: null, address: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; }
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  upsert: async (telegramId: number, userData: { first_name: string; username?: string | null; language?: string }) => {
    if (!isSupabaseConfigured) { await delay(); return { id: `${telegramId}`, telegram_id: telegramId, first_name: userData.first_name, username: userData.username ?? null, language: userData.language ?? 'ru', phone: null, address: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; }
    const existing = await userQueries.getByTelegramId(telegramId);
    if (existing) {
      return adminQueries.updateUser(existing.id, { ...userData, updated_at: new Date().toISOString() }) as Promise<User>;
    }
    return adminQueries.upsertUser({ telegram_id: telegramId, ...userData }) as Promise<User>;
  },

  updateProfile: async (telegramId: number, updates: { phone?: string; address?: string; first_name?: string }) => {
    if (!isSupabaseConfigured) { await delay(); return { id: `${telegramId}`, telegram_id: telegramId, first_name: updates.first_name || 'Гость', username: null, language: 'ru', phone: updates.phone ?? null, address: updates.address ?? null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; }
    const existing = await userQueries.getByTelegramId(telegramId);
    if (existing) {
      return adminQueries.updateUser(existing.id, { ...updates, updated_at: new Date().toISOString() }) as Promise<User>;
    }
    return adminQueries.upsertUser({ telegram_id: telegramId, ...updates }) as Promise<User>;
  },
};

export type CategoryWithCount = Category & { product_count: number };

export const categoryQueries = {
  getAll: async () => {
    if (!isSupabaseConfigured) {
      await delay();
      return mockCategories;
    }
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name->ru');

    if (error) throw error;
    return data;
  },

  getAllWithProductCount: async (): Promise<CategoryWithCount[]> => {
    if (!isSupabaseConfigured) {
      await delay();
      const products = await productQueries.getAll();
      const counts: Record<string, number> = {};
      products.items.forEach((p) => {
        if (p.category_id) counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
      });
      return mockCategories.map((c) => ({ ...c, product_count: counts[c.id] ?? 0 }));
    }

    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('*')
      .order('name->ru');

    if (catError) throw catError;

    const { data: products } = await supabase
      .from('products')
      .select('category_id');

    const counts: Record<string, number> = {};
    (products ?? []).forEach((p) => {
      if (p.category_id) counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
    });

    return (categories ?? []).map((c) => ({
      ...c,
      product_count: counts[c.id] ?? 0,
    }));
  },

  create: async (data: Database['public']['Tables']['categories']['Insert']) => {
    if (!isSupabaseConfigured) {
      await delay();
      const newCat = { ...data, id: `cat-${Date.now()}`, created_at: new Date().toISOString() } as Category;
      mockCategories.push(newCat);
      return newCat;
    }
    return adminQueries.createCategory(data);
  },

  update: async (id: string, data: Database['public']['Tables']['categories']['Update']) => {
    if (!isSupabaseConfigured) {
      await delay();
      const cat = mockCategories.find((c) => c.id === id);
      if (cat) Object.assign(cat, data);
      return cat as Category;
    }
    return adminQueries.updateCategory(id, data);
  },

  delete: async (id: string) => {
    if (!isSupabaseConfigured) {
      await delay();
      const idx = mockCategories.findIndex((c) => c.id === id);
      if (idx !== -1) mockCategories.splice(idx, 1);
      return;
    }
    await adminQueries.deleteCategory(id);
  },
};

export const orderQueries = {
  create: async (orderData: Database['public']['Tables']['orders']['Insert']) => {
    if (!isSupabaseConfigured) {
      await delay();
      return { ...orderData, id: `ord-${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status_history: [], transaction_id: null, paid_at: null } as Order;
    }
    const { data, error } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  getByTelegramUserId: async (telegramUserId: number) => {
    if (!isSupabaseConfigured) {
      await delay();
      return mockOrders;
    }
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('telegram_user_id', telegramUserId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data;
  },

  getById: async (id: string) => {
    if (!isSupabaseConfigured) {
      await delay();
      return mockOrders.find((o) => o.id === id) ?? null;
    }
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  updateStatus: async (id: string, status: string, changedBy = 'admin', note?: string) => {
    if (!isSupabaseConfigured) {
      await delay();
      const order = mockOrders.find((o) => o.id === id);
      if (order) order.status = status;
      return order as Order;
    }

    // Use RPC to atomically append to status_history (avoids race condition)
    const { data, error } = await supabase.rpc('append_order_status', {
      p_order_id: id,
      p_status: status,
      p_changed_by: changedBy,
      p_note: note || null,
    }).maybeSingle();

    if (error) throw error;
    return data as Order;
  },

  subscribeToOrders: (callback: (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string }) => void) => {
    if (!isSupabaseConfigured) return { unsubscribe: () => {} } as ReturnType<typeof supabase.channel>;
    return supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        callback
      )
      .subscribe();
  },
};

export const reviewQueries = {
  getByProductId: async (productId: string) => {
    if (!isSupabaseConfigured) {
      await delay();
      return [];
    }
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('product_id', productId)
      .eq('is_approved', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  create: async (reviewData: Database['public']['Tables']['reviews']['Insert']) => {
    if (!isSupabaseConfigured) {
      await delay();
      return { ...reviewData, id: `rev-${Date.now()}`, created_at: new Date().toISOString(), is_approved: true, photos: [], images: [], is_verified_purchase: false, admin_reply: null, updated_at: new Date().toISOString(), user_name: reviewData.user_name ?? '' } as Review;
    }
    return adminQueries.createReview(reviewData) as Promise<Review>;
  },

  getAverageRating: async (productId: string) => {
    if (!isSupabaseConfigured) return { average: 0, count: 0 };
    const { data, error, count } = await supabase
      .from('reviews')
      .select('rating', { count: 'exact' })
      .eq('product_id', productId)
      .eq('is_approved', true);

    if (error) throw error;

    if (!data || data.length === 0) return { average: 0, count: 0 };

    const sum = data.reduce((acc, review) => acc + review.rating, 0);
    return {
      average: sum / data.length,
      count: count ?? data.length,
    };
  },

  uploadReviewPhoto: async (file: File) => {
    if (!isSupabaseConfigured) {
      await delay();
      return URL.createObjectURL(file);
    }
    const fileExt = file.name.split('.').pop();
    const fileName = `review-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `reviews/${fileName}`;
    const fallbackPath = fileName;

    const buckets = ['review-photos', 'product-images'];
    for (const bucket of buckets) {
      const { error } = await supabase.storage.from(bucket).upload(filePath, file);
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
        return publicUrl;
      }
    }

    const { error: lastErr } = await supabase.storage.from('review-photos').upload(fallbackPath, file);
    if (lastErr) throw lastErr;
    const { data: { publicUrl } } = supabase.storage.from('review-photos').getPublicUrl(fallbackPath);
    return publicUrl;
  },

  getAll: async () => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  },

  getAllWithProductNames: async () => {
    if (!isSupabaseConfigured) return [];
    const { data: reviews, error: revError } = await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (revError) throw revError;

    const productIds = [...new Set((reviews ?? []).map(r => r.product_id))];
    if (productIds.length === 0) return [];

    const { data: products } = await supabase
      .from('products')
      .select('id, name')
      .in('id', productIds);

    const productMap: Record<string, { ru: string; uz: string }> = {};
    (products ?? []).forEach(p => { productMap[p.id] = p.name; });

    return (reviews ?? []).map(r => ({
      ...r,
      product_name: productMap[r.product_id] ?? { ru: 'Удалён', uz: 'O\'chirilgan' },
    }));
  },

  update: async (id: string, updates: Partial<Review>) => {
    if (!isSupabaseConfigured) {
      await delay();
      return;
    }
    await adminQueries.updateReview(id, { ...updates, updated_at: new Date().toISOString() });
  },

  approve: async (id: string) => {
    if (!isSupabaseConfigured) return;
    await adminQueries.approveReview(id);
  },

  reject: async (id: string) => {
    if (!isSupabaseConfigured) return;
    await adminQueries.rejectReview(id);
  },

  reply: async (id: string, reply: string) => {
    if (!isSupabaseConfigured) return;
    await adminQueries.replyToReview(id, reply);
  },
};

export type ProductCollection = Database['public']['Tables']['product_collections']['Row'];

export const productCollectionQueries = {
  getActive: async (): Promise<ProductCollection[]> => {
    if (!isSupabaseConfigured) {
      await delay();
      return [];
    }
    const { data, error } = await supabase
      .from('product_collections')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ProductCollection[];
  },

  getAll: async (): Promise<ProductCollection[]> => {
    if (!isSupabaseConfigured) {
      await delay();
      return [];
    }
    const { data, error } = await supabase
      .from('product_collections')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ProductCollection[];
  },

  getCollectionProducts: async (productIds: string[]) => {
    if (!isSupabaseConfigured || productIds.length === 0) return [];
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .in('id', productIds)
      .eq('is_active', true);
    if (error) throw error;
    const productMap = new Map((data ?? []).map(p => [p.id, p]));
    return productIds.map(id => productMap.get(id)).filter(Boolean) as Product[];
  },

  create: async (data: Database['public']['Tables']['product_collections']['Insert']) => {
    if (!isSupabaseConfigured) {
      await delay();
      return { ...data, id: `col-${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as ProductCollection;
    }
    return adminQueries.createCollection(data);
  },

  update: async (id: string, data: Database['public']['Tables']['product_collections']['Update']) => {
    if (!isSupabaseConfigured) {
      await delay();
      return { id, ...data } as ProductCollection;
    }
    return adminQueries.updateCollection(id, data);
  },

  delete: async (id: string) => {
    if (!isSupabaseConfigured) {
      await delay();
      return;
    }
    await adminQueries.deleteCollection(id);
  },
};

export const promotionQueries = {
  getActive: async (type?: 'new_arrival' | 'sale' | 'featured') => {
    if (!isSupabaseConfigured) { await delay(); return []; }
    let query = supabase
      .from('promotions')
      .select('*')
      .eq('is_active', true)
      .lte('starts_at', new Date().toISOString())
      .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`);

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  },

  getProductsByPromotion: async (promotionId: string) => {
    if (!isSupabaseConfigured) { await delay(); return []; }
    const { data: promotion } = await supabase
      .from('promotions')
      .select('product_ids')
      .eq('id', promotionId)
      .maybeSingle();

    if (!promotion || !promotion.product_ids?.length) return [];

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .in('id', promotion.product_ids)
      .eq('is_active', true);

    if (error) throw error;
    return data;
  },
};

export const referralQueries = {
  getByCode: async (code: string) => {
    if (!isSupabaseConfigured) { await delay(); return null; }
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('referral_code', code)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  create: async (telegramId: number) => {
    if (!isSupabaseConfigured) {
      await delay();
      return { id: `ref-${Date.now()}`, referrer_telegram_id: telegramId, referral_code: `REF${telegramId}${Math.random().toString(36).substring(7).toUpperCase()}`, bonus_amount: 50000, is_redeemed: false, redeemed_at: null, created_at: new Date().toISOString() } as Referral;
    }
    const code = `REF${telegramId}${Math.random().toString(36).substring(7).toUpperCase()}`;

    return adminQueries.createReferral({
      referrer_telegram_id: telegramId,
      referral_code: code,
    }) as Promise<Referral>;
  },

  getByReferrer: async (telegramId: number) => {
    if (!isSupabaseConfigured) { await delay(); return []; }
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_telegram_id', telegramId);

    if (error) throw error;
    return data;
  },

  redeem: async (referralId: string, referredTelegramId: number) => {
    if (!isSupabaseConfigured) { await delay(); return null; }
    return adminQueries.updateReferral(referralId, {
      referred_telegram_id: referredTelegramId,
      is_redeemed: true,
      redeemed_at: new Date().toISOString(),
    }) as Promise<Referral | null>;
  },
};

export type Banner = {
  id: string;
  title: { ru: string; uz: string };
  subtitle: { ru: string; uz: string };
  image_url: string;
  link_url: string | null;
  link_label: { ru: string; uz: string } | null;
  bg_color: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DeliveryZone = {
  id: string;
  city_ru: string;
  city_uz: string;
  region_ru: string;
  region_uz: string;
  standard_price: number;
  express_price: number;
  standard_days_min: number;
  standard_days_max: number;
  express_days_min: number;
  express_days_max: number;
  free_threshold: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const deliveryZoneQueries = {
  getActive: async (): Promise<DeliveryZone[]> => {
    if (!isSupabaseConfigured) { await delay(); return mockDeliveryZones.filter((z) => z.is_active); }
    const { data, error } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as DeliveryZone[];
  },

  getAll: async (): Promise<DeliveryZone[]> => {
    if (!isSupabaseConfigured) { await delay(); return mockDeliveryZones; }
    const { data, error } = await supabase
      .from('delivery_zones')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as DeliveryZone[];
  },

  create: async (zone: Omit<DeliveryZone, 'id' | 'created_at' | 'updated_at'>): Promise<DeliveryZone> => {
    if (!isSupabaseConfigured) { await delay(); return { ...zone, id: `zone-${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; }
    return adminQueries.createDeliveryZone(zone) as Promise<DeliveryZone>;
  },

  update: async (id: string, zone: Partial<Omit<DeliveryZone, 'id' | 'created_at' | 'updated_at'>>): Promise<DeliveryZone> => {
    if (!isSupabaseConfigured) { await delay(); const z = mockDeliveryZones.find((z) => z.id === id); if (z) Object.assign(z, zone); return z as DeliveryZone; }
    return adminQueries.updateDeliveryZone(id, zone) as Promise<DeliveryZone>;
  },

  delete: async (id: string): Promise<void> => {
    if (!isSupabaseConfigured) { await delay(); return; }
    await adminQueries.deleteDeliveryZone(id);
  },
};

export const bannerQueries = {
  getActive: async (): Promise<Banner[]> => {
    if (!isSupabaseConfigured) { await delay(); return mockBanners.filter((b) => b.is_active); }
    const { data, error } = await supabase
      .from('banners')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Banner[];
  },

  getAll: async (): Promise<Banner[]> => {
    if (!isSupabaseConfigured) { await delay(); return mockBanners; }
    const { data, error } = await supabase
      .from('banners')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Banner[];
  },

  create: async (banner: Omit<Banner, 'id' | 'created_at' | 'updated_at'>): Promise<Banner> => {
    if (!isSupabaseConfigured) { await delay(); return { ...banner, id: `banner-${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; }
    return adminQueries.createBanner(banner) as Promise<Banner>;
  },

  update: async (id: string, banner: Partial<Omit<Banner, 'id' | 'created_at' | 'updated_at'>>): Promise<Banner> => {
    if (!isSupabaseConfigured) { await delay(); return mockBanners[0] as Banner; }
    return adminQueries.updateBanner(id, banner) as Promise<Banner>;
  },

  delete: async (id: string): Promise<void> => {
    if (!isSupabaseConfigured) { await delay(); return; }
    await adminQueries.deleteBanner(id);
  },
};

export const paymentQueries = {
  createPayment: async (orderId: string, amount: number, paymentMethod: 'payme' | 'click' | 'uzum') => {
    if (!isSupabaseConfigured) { await delay(); return { paymentUrl: null, orderId }; }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const response = await fetch(`${supabaseUrl}/functions/v1/create-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'Apikey': anonKey,
      },
      body: JSON.stringify({ orderId, amount, paymentMethod }),
    });

    if (!response.ok) {
      throw new Error('Failed to create payment');
    }

    return response.json();
  },
};

export const favoriteQueries = {
  getByUser: async (telegramUserId: number) => {
    if (!isSupabaseConfigured || !telegramUserId) return [];
    const { data, error } = await supabase
      .from('favorites')
      .select('product_id, products(id, name, slug, price, images, is_active, stock, sizes, colors)')
      .eq('telegram_user_id', telegramUserId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({ ...row.products, favoriteId: row.product_id })) as (Product & { favoriteId: string })[];
  },

  getProductIds: async (telegramUserId: number) => {
    if (!isSupabaseConfigured || !telegramUserId) return [] as string[];
    const { data, error } = await supabase
      .from('favorites')
      .select('product_id')
      .eq('telegram_user_id', telegramUserId);
    if (error) throw error;
    return (data ?? []).map((row) => row.product_id) as string[];
  },

  add: async (telegramUserId: number, productId: string) => {
    if (!isSupabaseConfigured) return;
    try {
      await adminQueries.addFavorite({ telegram_user_id: telegramUserId, product_id: productId });
    } catch (e) {
      if (!(e instanceof Error && e.message.includes('unique'))) throw e;
    }
  },

  remove: async (telegramUserId: number, productId: string) => {
    if (!isSupabaseConfigured) return;
    await adminQueries.removeFavorite({ telegram_user_id: telegramUserId, product_id: productId });
  },

  updatePrefs: async (telegramUserId: number, productId: string, prefs: { notify_price?: boolean; notify_stock?: boolean }) => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase
      .from('favorites')
      .update(prefs)
      .eq('telegram_user_id', telegramUserId)
      .eq('product_id', productId);
    if (error) throw error;
  },

  getPrefs: async (telegramUserId: number, productId: string) => {
    if (!isSupabaseConfigured) return null;
    const { data } = await supabase
      .from('favorites')
      .select('notify_price, notify_stock')
      .eq('telegram_user_id', telegramUserId)
      .eq('product_id', productId)
      .maybeSingle();
    return data;
  },

  getAllStats: async () => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('favorites')
      .select('product_id, notify_price, notify_stock');
    if (error) throw error;

    const statsMap: Record<string, { likes: number; notify_price: number; notify_stock: number }> = {};
    (data ?? []).forEach((row) => {
      if (!statsMap[row.product_id]) {
        statsMap[row.product_id] = { likes: 0, notify_price: 0, notify_stock: 0 };
      }
      statsMap[row.product_id].likes++;
      if (row.notify_price) statsMap[row.product_id].notify_price++;
      if (row.notify_stock) statsMap[row.product_id].notify_stock++;
    });

    return Object.entries(statsMap).map(([product_id, stats]) => ({
      product_id,
      ...stats,
    }));
  },

  getStatsForProduct: async (productId: string) => {
    if (!isSupabaseConfigured) return { likes: 0, notify_price: 0, notify_stock: 0 };
    const { data, error } = await supabase
      .from('favorites')
      .select('notify_price, notify_stock')
      .eq('product_id', productId);
    if (error) throw error;

    const likes = data?.length ?? 0;
    const notify_price = data?.filter((r) => r.notify_price).length ?? 0;
    const notify_stock = data?.filter((r) => r.notify_stock).length ?? 0;
    return { likes, notify_price, notify_stock };
  },

  getNotifyPriceUsers: async (productId: string) => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('favorites')
      .select('telegram_user_id')
      .eq('product_id', productId)
      .eq('notify_price', true);
    if (error) throw error;
    return (data ?? []).map((r) => r.telegram_user_id);
  },

  getNotifyStockUsers: async (productId: string) => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('favorites')
      .select('telegram_user_id')
      .eq('product_id', productId)
      .eq('notify_stock', true);
    if (error) throw error;
    return (data ?? []).map((r) => r.telegram_user_id);
  },
};

export type Coupon = Database['public']['Tables']['coupons']['Row'];
export type CouponUsage = Database['public']['Tables']['coupon_usage']['Row'];
export type Return = Database['public']['Tables']['returns']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type AuditLogEntry = Database['public']['Tables']['audit_log']['Row'];
export type ProductRelation = Database['public']['Tables']['product_relations']['Row'];

export const couponQueries = {
  validate: async (code: string, telegramUserId: number, orderAmount: number) => {
    if (!isSupabaseConfigured) return { valid: true, coupon: null, discount: 0, error: null };
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .maybeSingle();
    if (error || !coupon) return { valid: false, coupon: null, discount: 0, error: 'Купон не найден' };
    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) return { valid: false, coupon, discount: 0, error: 'Купон истёк' };
    if (new Date(coupon.valid_from) > new Date()) return { valid: false, coupon, discount: 0, error: 'Купон ещё не активен' };
    if (orderAmount < coupon.min_order_amount) return { valid: false, coupon, discount: 0, error: `Минимальная сумма: ${coupon.min_order_amount}` };
    if (coupon.max_uses_total) {
      const { count } = await supabase.from('coupon_usage').select('*', { count: 'exact', head: true }).eq('coupon_id', coupon.id);
      if ((count ?? 0) >= coupon.max_uses_total) return { valid: false, coupon, discount: 0, error: 'Купон закончился' };
    }
    const { count: userCount } = await supabase.from('coupon_usage').select('*', { count: 'exact', head: true }).eq('coupon_id', coupon.id).eq('telegram_user_id', telegramUserId);
    if ((userCount ?? 0) >= coupon.max_uses_per_user) return { valid: false, coupon, discount: 0, error: 'Вы уже использовали этот купон' };
    if (coupon.new_customers_only) {
      const { count: orderCount } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('telegram_user_id', telegramUserId);
      if ((orderCount ?? 0) > 0) return { valid: false, coupon, discount: 0, error: 'Купон только для новых клиентов' };
    }
    const discount = coupon.type === 'percent' ? Math.round(orderAmount * coupon.value / 100) : Math.min(coupon.value, orderAmount);
    return { valid: true, coupon, discount, error: null };
  },

  recordUsage: async (couponId: string, telegramUserId: number, orderId?: string) => {
    if (!isSupabaseConfigured) return;
    await adminQueries.recordCouponUsage(couponId, telegramUserId, orderId);
  },

  getAll: async () => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  create: async (coupon: Omit<Coupon, 'id' | 'created_at' | 'updated_at'>) => {
    if (!isSupabaseConfigured) return { ...coupon, id: `coupon-${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Coupon;
    return adminQueries.createCoupon(coupon) as Promise<Coupon>;
  },

  update: async (id: string, updates: Partial<Omit<Coupon, 'id' | 'created_at' | 'updated_at'>>) => {
    if (!isSupabaseConfigured) return {} as Coupon;
    return adminQueries.updateCoupon(id, updates) as Promise<Coupon>;
  },

  delete: async (id: string) => {
    if (!isSupabaseConfigured) return;
    await adminQueries.deleteCoupon(id);
  },

  getUsageStats: async (couponId: string) => {
    if (!isSupabaseConfigured) return { totalUses: 0, uniqueUsers: 0 };
    const { data } = await supabase.from('coupon_usage').select('telegram_user_id').eq('coupon_id', couponId);
    const users = new Set((data ?? []).map((u) => u.telegram_user_id));
    return { totalUses: data?.length ?? 0, uniqueUsers: users.size };
  },
};

export const returnQueries = {
  create: async (returnData: Omit<Return, 'id' | 'created_at' | 'updated_at' | 'status' | 'refund_amount' | 'admin_note'>) => {
    if (!isSupabaseConfigured) return { ...returnData, id: `ret-${Date.now()}`, status: 'pending' as const, refund_amount: 0, admin_note: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Return;
    return adminQueries.createReturn(returnData) as Promise<Return>;
  },

  getByUser: async (telegramUserId: number) => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase.from('returns').select('*').eq('telegram_user_id', telegramUserId).order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  getAll: async () => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase.from('returns').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  updateStatus: async (id: string, status: Return['status'], adminNote?: string) => {
    if (!isSupabaseConfigured) return {} as Return;
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (adminNote) updates.admin_note = adminNote;
    if (status === 'refunded') updates.refund_amount = 0;
    return adminQueries.updateReturnStatus(id, updates) as Promise<Return>;
  },
};

export const notificationQueries = {
  getByUser: async (telegramUserId: number) => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase.from('notifications').select('*').eq('telegram_user_id', telegramUserId).order('created_at', { ascending: false }).limit(30);
    if (error) throw error;
    return data ?? [];
  },

  getUnreadCount: async (telegramUserId: number) => {
    if (!isSupabaseConfigured) return 0;
    const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('telegram_user_id', telegramUserId).eq('is_read', false);
    return count ?? 0;
  },

  markAsRead: async (id: string) => {
    if (!isSupabaseConfigured) return;
    await adminQueries.markNotificationRead(id);
  },

  markAllAsRead: async (telegramUserId: number) => {
    if (!isSupabaseConfigured) return;
    const notifications = await adminQueries.getNotifications({ telegram_user_id: telegramUserId, is_read: false }) as Array<{ id: string }>;
    await Promise.all(notifications.map(n => adminQueries.markNotificationRead(n.id)));
  },

  create: async (notification: Omit<Notification, 'id' | 'created_at' | 'is_read' | 'sent_at'>) => {
    if (!isSupabaseConfigured) return;
    await adminQueries.createNotification(notification);
  },
};

export const auditLogQueries = {
  log: async (entry: Omit<AuditLogEntry, 'id' | 'created_at' | 'ip_address' | 'entity_id'> & { entity_id?: string | null; ip_address?: string | null }) => {
    if (!isSupabaseConfigured) return;
    try {
      await adminQueries.insertAuditLog({ ...entry, entity_id: entry.entity_id ?? null, ip_address: entry.ip_address ?? null });
    } catch { /* non-critical */ }
  },

  getAll: async (limit = 100) => {
    if (!isSupabaseConfigured) return [];
    try {
      const data = await adminQueries.getAuditLogFiltered({});
      return (Array.isArray(data) ? data : []).slice(0, limit);
    } catch { return []; }
  },

  getByEntity: async (entityType: string, entityId?: string) => {
    if (!isSupabaseConfigured) return [];
    try {
      const filters: Record<string, unknown> = { entity_type: entityType };
      if (entityId) filters.entity_id = entityId;
      const data = await adminQueries.getAuditLogFiltered(filters);
      return Array.isArray(data) ? data.slice(0, 50) : [];
    } catch { return []; }
  },

  getByAdmin: async (adminId: string) => {
    if (!isSupabaseConfigured) return [];
    try {
      const data = await adminQueries.getAuditLogFiltered({ admin_id: adminId });
      return Array.isArray(data) ? data.slice(0, 100) : [];
    } catch { return []; }
  },
};

export const productRelationQueries = {
  getRelated: async (productId: string, type?: ProductRelation['relation_type']) => {
    if (!isSupabaseConfigured) return [];
    let query = supabase.from('product_relations').select('*, products!product_relations_related_product_id_fkey(*)').eq('product_id', productId).order('sort_order');
    if (type) query = query.eq('relation_type', type);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  getUpsells: async (productId: string) => {
    return productRelationQueries.getRelated(productId, 'upsell');
  },

  getCrossSells: async (productId: string) => {
    return productRelationQueries.getRelated(productId, 'cross_sell');
  },

  create: async (relation: Omit<ProductRelation, 'id' | 'created_at'>) => {
    if (!isSupabaseConfigured) return { ...relation, id: `pr-${Date.now()}`, created_at: new Date().toISOString() } as ProductRelation;
    return adminQueries.createProductRelation(relation) as Promise<ProductRelation>;
  },

  delete: async (id: string) => {
    if (!isSupabaseConfigured) return;
    await adminQueries.deleteProductRelation(id);
  },
};

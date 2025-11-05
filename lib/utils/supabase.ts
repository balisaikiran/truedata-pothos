import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

/**
 * Initialize Supabase client
 */
export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  // Prioritize service role key for server-side operations (bypasses RLS)
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Supabase] Missing configuration. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
    throw new Error('Supabase URL and Key must be set in environment variables');
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });

  console.log('[Supabase] Client initialized successfully');
  return supabaseClient;
}

/**
 * Cache data in Supabase
 */
export async function cacheData<T>(
  table: string,
  key: string,
  data: T,
  ttlMinutes: number = 5
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    const { error } = await supabase
      .from(table)
      .upsert({
        cache_key: key,
        data: data,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'cache_key'
      });

    if (error) {
      console.error(`[Supabase] Error caching data for key ${key}:`, error);
      throw error;
    }
  } catch (error: any) {
    // If Supabase is not configured, log warning but don't throw
    if (error.message?.includes('Supabase URL')) {
      console.warn('[Supabase] Not configured, skipping cache');
      return;
    }
    console.error(`[Supabase] Failed to cache data:`, error);
    throw error;
  }
}

/**
 * Get cached data from Supabase
 */
export async function getCachedData<T>(
  table: string,
  key: string
): Promise<T | null> {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from(table)
      .select('data, expires_at')
      .eq('cache_key', key)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - cache miss
        return null;
      }
      console.error(`[Supabase] Error getting cached data for key ${key}:`, error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Check if expired
    const expiresAt = new Date(data.expires_at);
    if (expiresAt < new Date()) {
      // Delete expired entry
      await supabase
        .from(table)
        .delete()
        .eq('cache_key', key);
      return null;
    }

    return data.data as T;
  } catch (error: any) {
    // If Supabase is not configured, return null (cache miss)
    if (error.message?.includes('Supabase URL')) {
      console.warn('[Supabase] Not configured, returning cache miss');
      return null;
    }
    console.error(`[Supabase] Failed to get cached data:`, error);
    return null;
  }
}

/**
 * Delete cached data from Supabase
 */
export async function deleteCachedData(
  table: string,
  key: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('cache_key', key);

    if (error) {
      console.error(`[Supabase] Error deleting cached data for key ${key}:`, error);
    }
  } catch (error: any) {
    if (error.message?.includes('Supabase URL')) {
      return; // Supabase not configured, skip
    }
    console.error(`[Supabase] Failed to delete cached data:`, error);
  }
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpiredCache(table: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from(table)
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      console.error(`[Supabase] Error cleaning up expired cache:`, error);
    }
  } catch (error: any) {
    if (error.message?.includes('Supabase URL')) {
      return; // Supabase not configured, skip
    }
    console.error(`[Supabase] Failed to cleanup expired cache:`, error);
  }
}


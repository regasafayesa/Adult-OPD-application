import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const missingVariables = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabasePublishableKey && 'VITE_SUPABASE_PUBLISHABLE_KEY',
].filter(Boolean);

let supabase = null;
let supabaseConfigError = '';

if (missingVariables.length > 0) {
  supabaseConfigError = `Missing required environment variable(s): ${missingVariables.join(', ')}.`;
} else {
  try {
    const parsedUrl = new URL(supabaseUrl);
    const isLocalDevelopment =
      import.meta.env.DEV &&
      (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1');

    if (parsedUrl.protocol !== 'https:' && !isLocalDevelopment) {
      throw new Error('The Supabase URL must use HTTPS.');
    }

    supabase = createClient(supabaseUrl, supabasePublishableKey);
  } catch {
    supabaseConfigError = 'The Supabase environment configuration is invalid.';
  }
}

export { supabase, supabaseConfigError };

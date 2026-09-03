import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Credenciais públicas do projeto Supabase (chave "anon"/publishable — segura para expor no front-end,
// já que o acesso real é controlado por Row Level Security no banco).
const SUPABASE_URL = 'https://lcxvgynwpgwqhsvawuvj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qw8j7_6Immw5o7HZS_gV3Q_YCkdn2Tc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

// Função para extrair os parâmetros da URL (# ou ?) com tipos tipados para o TypeScript
function extractParamsFromUrl(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryString = url.includes('#')
    ? url.split('#')[1]
    : url.includes('?')
    ? url.split('?')[1]
    : '';

  if (!queryString) return params;

  queryString.split('&').forEach((param) => {
    const [key, value] = param.split('=');
    if (key && value) {
      params[key] = decodeURIComponent(value);
    }
  });

  return params;
}

// Captura dinamicamente o IP do Metro Bundler no Expo Go (ex: 192.168.0.14:8081)
const debuggerHost =
  Constants.manifest2?.extra?.expoGo?.debuggerHost ??
  Constants.manifest?.debuggerHost ??
  Constants.expoConfig?.hostUri;

// Redirecionamento dinâmico: usa exp:// no Expo Go e rotafit:// na Build final (APK)
export const authRedirectUri = debuggerHost
  ? `exp://${debuggerHost}/`
  : AuthSession.makeRedirectUri({ scheme: 'rotafit' });

export async function signInWithGoogle(): Promise<void> {
  try {
    console.log('=== SUA REDIRECT URI ===:', authRedirectUri);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authRedirectUri,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (!data?.url) throw new Error('Não foi possível iniciar o login com o Google.');

    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      authRedirectUri
    );

    console.log('=== RESULTADO WEBBROWSER ===:', result);

    if (result.type === 'success' && result.url) {
      const params = extractParamsFromUrl(result.url);
      const access_token = params['access_token'];
      const refresh_token = params['refresh_token'];
      const code = params['code'];

      console.log('=== PARAMS EXTRAÍDOS ===:', { 
        temAccessToken: !!access_token, 
        temRefreshToken: !!refresh_token, 
        code 
      });

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      } else if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (sessionError) throw sessionError;
      } else {
        throw new Error('Nenhum token ou código de autenticação foi encontrado na URL de retorno.');
      }
    }
  } catch (err) {
    console.error('=== ERRO DETALHADO OAUTH ===:', err);
    throw err;
  }
}
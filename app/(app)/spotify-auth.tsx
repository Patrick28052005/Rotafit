import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

export default function SpotifyAuthRoute() {
  const router = useRouter();

  useEffect(() => {
    // Dá tempo para o SpotifyContext processar o token e regressa ao ecrã inicial
    const timer = setTimeout(() => {
      router.replace('/');
    }, 500);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#090A0F' }}>
      <ActivityIndicator size="large" color="#1DB954" />
    </View>
  );
}
import Svg, { Path } from 'react-native-svg';

export function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.9 6.1C12.3 13.1 17.7 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 2.2-1.9 4.1-3.8 5.4l7.2 5.6c4.3-4 6.8-9.9 6.8-15.5z"
      />
      <Path
        fill="#FBBC05"
        d="M10.4 19.3c-1.1 3.2-1.1 6.6 0 9.8l-7.9 6.1C0 30.8 0 17.2 2.5 13.2l7.9 6.1z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.4 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-3.6-13.6-8.7l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </Svg>
  );
}

export default GoogleIcon;
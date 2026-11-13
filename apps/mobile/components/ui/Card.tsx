import { View, ViewProps } from 'react-native';

interface Props extends ViewProps {
  children: React.ReactNode;
}

/** Paper card: hairline rule, soft lifted shadow (New Architecture boxShadow). */
export const CARD_SHADOW = '0px 1px 0px rgba(21, 33, 28, 0.04), 0px 12px 24px -16px rgba(60, 40, 10, 0.28)';

export function Card({ children, className, style, ...props }: Props) {
  return (
    <View
      {...props}
      className={`bg-card rounded-3xl p-4 border border-border ${className ?? ''}`}
      style={[{ boxShadow: CARD_SHADOW }, style]}
    >
      {children}
    </View>
  );
}

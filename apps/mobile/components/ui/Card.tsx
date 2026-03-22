import { View, ViewProps } from 'react-native';

interface Props extends ViewProps {
  children: React.ReactNode;
}

export function Card({ children, className, ...props }: Props) {
  return (
    <View
      {...props}
      className={`bg-card dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-border dark:border-slate-700 ${className ?? ''}`}
    >
      {children}
    </View>
  );
}

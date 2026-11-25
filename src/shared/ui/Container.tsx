import React from 'react';

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  maxWidth?: 'md' | 'lg' | 'xl';
}

const widthMap: Record<NonNullable<ContainerProps['maxWidth']>, string> = {
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
};

export const Container: React.FC<ContainerProps> = ({
  maxWidth = 'xl',
  className = '',
  children,
  ...rest
}) => {
  return (
    <div className={`w-full mx-auto px-4 ${widthMap[maxWidth]} ${className}`} {...rest}>
      {children}
    </div>
  );
};

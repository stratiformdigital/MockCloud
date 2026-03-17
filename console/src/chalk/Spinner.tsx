export function ChalkSpinner({ size = 'normal' }: { size?: 'normal' | 'large' }) {
  return (
    <span className={`chalk-spinner chalk-spinner-${size}`} />
  );
}

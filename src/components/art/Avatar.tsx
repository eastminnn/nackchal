import { CHARACTER_MODELS } from '../../data/characters';

export function Avatar({ index, className = '' }: { readonly index: number; readonly className?: string }) {
  const name = CHARACTER_MODELS[index % CHARACTER_MODELS.length] ?? CHARACTER_MODELS[0];
  return (
    <img
      className={`avatar-art ${className}`}
      src={`/art/residents/${name}.webp`}
      width="600"
      height="680"
      alt=""
    />
  );
}

import { CHARACTER_MODELS, CHARACTER_NAMES, type CharacterModel } from '../../data/characters';

/** 네 캐릭터 초상 중 하나를 고르는 라디오 묶음. */
export function CharacterPicker({
  name,
  value,
  onChange,
  disabled = false,
}: {
  readonly name: string;
  readonly value: CharacterModel;
  readonly onChange: (next: CharacterModel) => void;
  readonly disabled?: boolean;
}) {
  return (
    <div className="character-picker" role="radiogroup" aria-label="캐릭터">
      {CHARACTER_MODELS.map((model) => (
        <label key={model} className="character-option">
          <input
            type="radio"
            name={name}
            value={model}
            checked={value === model}
            disabled={disabled}
            onChange={() => onChange(model)}
          />
          <img src={`/art/residents/${model}.webp`} width="600" height="680" alt="" />
          <span>{CHARACTER_NAMES[model]}</span>
        </label>
      ))}
    </div>
  );
}

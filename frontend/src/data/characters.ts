export const CHARACTER_MODELS = ['plush-bear', 'plush-bunny', 'plush-cat', 'plush-dog'] as const;
export type CharacterModel = (typeof CHARACTER_MODELS)[number];

export const CHARACTER_NAMES: Readonly<Record<CharacterModel, string>> = {
  'plush-bear': '곰',
  'plush-bunny': '토끼',
  'plush-cat': '고양이',
  'plush-dog': '강아지',
};

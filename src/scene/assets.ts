export const BAKERY_MODELS = [
  'chair',
  'floor_wood',
  'rug',
  'table_round_A',
  'counter_table',
  'wall_modular_panelled_bakery_straight_A',
  'wall_modular_panelled_bakery_window_large_A',
  'window_large_modular',
  'curtains',
  'wall_shelf_bakery_A',
  'countertop_closet_A_large',
  'display_case_long',
  'coffee_machine',
  'cookie_jar',
  'pastry_stand_A_decorated',
  'mug_B',
] as const;
export type BakeryModel = (typeof BAKERY_MODELS)[number];

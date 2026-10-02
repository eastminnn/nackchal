import { ModelAsset } from './ModelAsset';
import { Block, Cylinder, SoftBox } from './primitives';

export function AuctionInterior() {
  return (
    <group>
      <ModelAsset name="floor_wood" at={[0, -0.15, 0]} size={[14, 0.16, 19]} />
      <Block at={[0, 6.2, 0]} size={[14, 0.2, 19]} color="#514a37" />
      {[-5.25, -1.75, 1.75, 5.25].map((x) => (
        <ModelAsset
          key={x}
          name="wall_modular_panelled_bakery_straight_A"
          at={[x, 0, -7.2]}
          size={[3.5, 6.2, 0.35]}
        />
      ))}
      {[-1, 1].map((side) => (
        <group key={side}>
          <ModelAsset
            name="wall_modular_panelled_bakery_straight_A"
            at={[side * 7, 0, 1.3]}
            size={[10, 6.2, 0.35]}
            rotation={[0, (-side * Math.PI) / 2, 0]}
          />
          <ModelAsset
            name="wall_modular_panelled_bakery_window_large_A"
            at={[side * 7, 0, -5.45]}
            size={[3.5, 6.2, 0.35]}
            rotation={[0, (-side * Math.PI) / 2, 0]}
          />
          <ModelAsset
            name="window_large_modular"
            at={[side * 6.8, 2.05, -5.45]}
            size={[2.6, 2.8, 0.24]}
            rotation={[0, (-side * Math.PI) / 2, 0]}
          />
          <ModelAsset
            name="curtains"
            at={[side * 6.6, 2, -5.45]}
            size={[3, 3.1, 0.3]}
            rotation={[0, (-side * Math.PI) / 2, 0]}
          />
          <ModelAsset name="countertop_closet_A_large" at={[side * 4.9, 0, -6.25]} size={[3, 1.6, 1.15]} />
          <ModelAsset name="wall_shelf_bakery_A" at={[side * 4.9, 2.6, -6.85]} size={[2.8, 1.4, 0.5]} />
          <ModelAsset name="cookie_jar" at={[side * 4.2, 1.6, -6.1]} size={[0.48, 0.6, 0.48]} />
          <ModelAsset name="mug_B" at={[side * 5.5, 1.6, -6.1]} size={[0.45, 0.45, 0.38]} />
          <SoftBox at={[side * 2.7, 3.5, -6.75]} size={[0.12, 0.7, 0.18]} color="#795437" />
          <Cylinder at={[side * 2.7, 4, -6.65]} radius={0.4} top={0.24} height={0.45} color="#efd6a4" />
          <pointLight
            position={[side * 2.7, 3.7, -5.9]}
            color="#ffd99d"
            intensity={22}
            distance={9}
            decay={2}
          />
        </group>
      ))}
      <ModelAsset name="rug" at={[0, 0.025, 0.3]} size={[8.3, 0.045, 10]} />
      <SoftBox at={[0, 0.2, -4.9]} size={[7, 0.4, 3.8]} color="#795437" />
      <SoftBox at={[0, 0.12, -2.85]} size={[5, 0.23, 0.7]} color="#a36f43" />
      <ModelAsset name="table_round_A" at={[0, 0.4, -4.3]} size={[2.65, 1.25, 2.65]} />
      <Cylinder at={[0, 1.69, -4.3]} radius={1.1} height={0.12} color="#795437" />
      <ModelAsset
        name="display_case_long"
        at={[-5.9, 0, -1]}
        size={[2, 1.7, 1.1]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <ModelAsset name="pastry_stand_A_decorated" at={[-5.9, 1.7, -1]} size={[0.8, 0.8, 0.8]} />
      <ModelAsset
        name="counter_table"
        at={[5.8, 0, -1.2]}
        size={[1.8, 1.5, 1.15]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <ModelAsset
        name="coffee_machine"
        at={[5.8, 1.5, -1.2]}
        size={[0.8, 0.9, 0.75]}
        rotation={[0, -Math.PI / 2, 0]}
      />
    </group>
  );
}

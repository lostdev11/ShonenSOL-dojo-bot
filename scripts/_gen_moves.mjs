const archetypes = ["offense", "defense", "mobility", "control", "burst"];
const affinities = ["strength", "speed", "defense", "spirit", "chakra", "luck"];

const tier1Names = [
  ["ember_fist", "Ember Fist", "Jab wrapped in lingering heat."],
  ["mist_veil", "Mist Veil", "Vanish edges of your silhouette."],
  ["root_stance", "Root Stance", "Low center; hard to shove."],
  ["thread_bind", "Thread Bind", "Snare rhythm with feints."],
  ["snap_elbow", "Snap Elbow", "Short arc, mean contact."],
  ["river_roll", "River Roll", "Flow around the lock."],
  ["stone_shoulder", "Stone Shoulder", "Turn a hit into a brace."],
  ["cloud_split", "Cloud Split", "Cut through smoke and doubt."],
  ["needle_knee", "Needle Knee", "Rise sudden up the middle."],
  ["echo_palm", "Echo Palm", "Strike that asks twice."],
  ["drift_slide", "Drift Slide", "Glide wide; deny the lane."],
  ["iron_breath", "Iron Breath", "Steady lungs; steady guard."],
  ["spiral_throw", "Spiral Throw", "Redirect with a twist."],
  ["pulse_check", "Pulse Check", "Read openings by touch."],
  ["shade_step", "Shade Step", "Borrow the blind spot."],
  ["thorn_push", "Thorn Push", "Painful clearance."],
  ["mirror_line", "Mirror Line", "Match their tempo; steal it."],
  ["hollow_block", "Hollow Block", "Let power pass through air."],
  ["flare_turn", "Flare Turn", "Spin off the bind."],
  ["kite_string", "Kite String", "Keep them on your lead."],
  ["ember_guard", "Ember Guard", "Warm ring; cool head."],
  ["crane_drop", "Crane Drop", "Vertical answer to pressure."],
  ["serpent_whip", "Serpent Whip", "Whip the angle open."],
  ["amber_hold", "Amber Hold", "Freeze the moment you need."],
  ["lotus_pivot", "Lotus Pivot", "Turn without losing root."],
];

const tier2Names = [
  ["thunder_rim", "Thunder Rim", "Shock the guard from below."],
  ["void_slip", "Void Slip", "Step where they did not swing."],
  ["mountain_echo", "Mountain Echo", "Second wave hits harder."],
  ["tidebreaker", "Tidebreaker", "Splash through the wall."],
  ["silver_arc", "Silver Arc", "Clean slash of intent."],
  ["heartline", "Heartline", "Honest thrust; no disguise."],
  ["night_ledger", "Night Ledger", "Pay pain with interest."],
  ["wind_knot", "Wind Knot", "Tangle limbs mid-motion."],
  ["brazen_rush", "Brazen Rush", "Take space like it is owed."],
  ["glass_parry", "Glass Parry", "Barely there; razor sharp."],
  ["spirit_chain", "Spirit Chain", "Link hits into verdict."],
  ["ember_typhoon", "Ember Typhoon", "Heat and swirl together."],
  ["shadow_clock", "Shadow Clock", "Every tick is yours."],
  ["aurora_kick", "Aurora Kick", "Arc that paints the sky."],
  ["deep_current", "Deep Current", "Pull them into your pace."],
  ["iron_bloom", "Iron Bloom", "Guard flowers into strike."],
  ["luck_weave", "Luck Weave", "Thread probability tight."],
  ["phantom_tag", "Phantom Tag", "Touch they feel too late."],
  ["solar_rib", "Solar Rib", "Body line like a beam."],
  ["monsoon_heel", "Monsoon Heel", "Rain of downward checks."],
  ["rift_palm", "Rift Palm", "Open a gap with pressure."],
  ["starfall", "Starfall", "Drop from nowhere."],
  ["ember_domain", "Ember Domain", "Own the heated center."],
  ["quiet_burst", "Quiet Burst", "No shout; all damage."],
  ["woven_strike", "Woven Strike", "Braid offense into defense."],
];

const tier3Names = [
  ["apex_line", "Apex Line", "Straight path to the throne."],
  ["eclipse_wheel", "Eclipse Wheel", "Spin that eats daylight."],
  ["thousand_pulse", "Thousand Pulse", "Many beats become one blow."],
  ["sovereign_guard", "Sovereign Guard", "Refuse ruin at the gate."],
  ["blood_oath_feint", "Blood Oath Feint", "Promise violence; deliver worse."],
  ["skyhook_reversal", "Skyhook Reversal", "Turn ascent into doom."],
  ["gravity_well", "Gravity Well", "They sink into your orbit."],
  ["mirage_fatal", "Mirage Fatal", "Truth arrives last."],
  ["crowned_elbow", "Crowned Elbow", "Royal finish from inside."],
  ["storm_ledger", "Storm Ledger", "Totals paid in thunder."],
  ["sanctum_wall", "Sanctum Wall", "No passage without tribute."],
  ["razor_canvas", "Razor Canvas", "Paint them into corners."],
  ["pulse_crown", "Pulse Crown", "Rule the heartbeat of the fight."],
  ["spirit_nova", "Spirit Nova", "Detonate aura at contact."],
  ["lotus_sentence", "Lotus Sentence", "Close the case gently."],
  ["iron_symphony", "Iron Symphony", "Many guards; one crescendo."],
  ["chakrastorm", "Chakra Storm", "Spiral pressure everywhere."],
  ["destiny_fork", "Destiny Fork", "Force a bad fork in their plan."],
  ["obsidian_slide", "Obsidian Slide", "Frictionless doom."],
  ["aurum_thread", "Aurum Thread", "Gold line through chaos."],
  ["void_verdict", "Void Verdict", "Judgment without witness."],
  ["ember_crown_kick", "Crown Flame Kick", "Leg wearing authority."],
  ["temple_breaker", "Temple Breaker", "Doctrine meets dust."],
  ["harmonic_burst", "Harmonic Burst", "Strike at resonant timing."],
  ["zenith_charge", "Zenith Charge", "Highest point of impact."],
];

const tier4Names = [
  ["skyforge_finisher", "Skyforge Finisher", "Hammer forged in open air."],
  ["world_edge", "World Edge", "Stand where endings begin."],
  ["oathbreaker_nova", "Oathbreaker Nova", "Break limits; owe nothing."],
  ["silent_cataclysm", "Silent Cataclysm", "Ruin without rehearsal."],
  ["infinite_gate", "Infinite Gate", "Step through endless openings."],
  ["soul_tributary", "Soul Tributary", "Flow that claims its due."],
  ["starforge_palm", "Starforge Palm", "Heat of distant cores."],
  ["last_breath_arts", "Last Breath Arts", "Finalize with honor."],
  ["absolute_line", "Absolute Line", "No debate; only result."],
  ["heavens_ledger", "Heavens Ledger", "Balance paid in radiance."],
  ["dojos_end", "Dojos End", "Close the chapter."],
  ["aurora_sovereign", "Aurora Sovereign", "Light that commands."],
  ["chronicle_drop", "Chronicle Drop", "History falls on them."],
  ["void_monarch", "Void Monarch", "Rule the empty space."],
  ["ember_genesis", "Ember Genesis", "Begin again in fire."],
];

function emitMoves(tier, rows, basePrice, priceStep, baseBonus, bonusStep, trainEvery) {
  let out = "";
  rows.forEach(([id, name, short], i) => {
    const arch = archetypes[i % archetypes.length];
    const aff = affinities[i % affinities.length];
    const shopPrice = basePrice + i * priceStep;
    const bonus = Number((baseBonus + i * bonusStep).toFixed(2));
    const train = trainEvery > 0 && i % trainEvery === 0;
    out +=
      `  ${id}: {\n` +
      `    id: "${id}",\n` +
      `    name: "${name}",\n` +
      `    short: "${short}",\n` +
      `    finalScoreFlatBonus: ${bonus},\n` +
      `    archetype: "${arch}",\n` +
      `    affinityStat: "${aff}",\n` +
      `    trainUnlock: ${train},\n` +
      `    tier: ${tier},\n` +
      `    shopPrice: ${shopPrice},\n` +
      `  },\n`;
  });
  return out;
}

const all =
  emitMoves(1, tier1Names, 42, 1, 1.06, 0.0125, 3) +
  emitMoves(2, tier2Names, 88, 2, 1.92, 0.019, 2) +
  emitMoves(3, tier3Names, 160, 2, 2.42, 0.0168, 2) +
  emitMoves(4, tier4Names, 290, 4, 2.96, 0.026, 1);

process.stdout.write(all);
console.error(
  "counts",
  tier1Names.length + tier2Names.length + tier3Names.length + tier4Names.length,
);

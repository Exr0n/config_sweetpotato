#!/usr/bin/env python3
"""
Patch Claude Code's progress-spinner verb pool with a themed animal pool.

Claude Code (Bun-compiled native binary) embeds its progress verbs as a JS
literal `$38=["Accomplishing","Actioning",...,"Zigzagging"]` in the bundled
source blob inside the executable. There are two byte-identical copies far
apart in the file (one in the runtime bundle, one in source-map debug info).

To avoid shifting any subsequent bytes (which would break offset-references in
the bundle), we keep the *total byte count of the array literal* identical and
just rearrange duck-verb content inside it. We then re-sign ad-hoc so the
hardened-runtime check accepts the modified file.

Usage:
    patch_claude_verbs.py [--binary PATH] [--pool ANIMAL] [--seed N]
                          [--restore] [--dry-run]

Defaults: binary=$(readlink -f ~/.local/bin/claude), pool=duck.

Idempotent — re-running picks a fresh draw and patches in place. Keeps a
backup at <binary>.orig the first time it runs.
"""

from __future__ import annotations

import argparse
import os
import random
import re
import shutil
import subprocess
import sys
from pathlib import Path

# -----------------------------------------------------------------------------
# Animal verb pools. Each entry is a plain-ASCII gerund / verb-shaped phrase.
# The packer needs lengths spanning roughly 6–18 bytes to hit any byte target.
# -----------------------------------------------------------------------------

POOLS: dict[str, list[str]] = {
    "lion": [
        # 7 bytes
        "roaring", "yawning", "panting", "leaping",
        "rolling",
        # 8 bytes
        "prowling", "stalking", "pouncing", "sleeping",
        "growling", "snarling", "snoozing",
        # 9 bytes
        "ambushing", "sprinting", "crouching",
        # 10 bytes
        "stretching", "nap-taking",
        # 11 bytes
        "sun-basking", "fang-baring", "paw-licking", "log-leaping",
        "lip-curling", "paw-swiping",
        # 12 bytes
        "mane-shaking", "cub-nuzzling", "head-butting", "mate-calling",
        "rib-cracking", "cub-teaching", "dust-rolling", "fly-swatting",
        "fur-grooming", "bone-gnawing", "sun-blinking", "paw-pressing",
        "dawn-hunting", "dusk-hunting", "kin-grooming", "head-rubbing",
        "cub-carrying", "deep-calling", "hind-kicking", "wind-tasting",
        "slow-padding", "wide-yawning", "fly-flicking", "dust-bathing",
        "kill-sharing",
        # 13 bytes
        "pride-leading", "tail-flicking", "scent-marking", "hyena-chasing",
        "ear-twitching", "shade-seeking", "water-lapping", "blood-licking",
        "eye-narrowing", "tail-swishing", "mane-fluffing", "group-resting",
        "scruff-biting", "mock-fighting", "rival-roaring", "rival-staring",
        "chest-puffing", "fur-bristling", "throat-biting", "neck-snapping",
        "prey-dragging", "kill-hoarding", "bird-watching", "sun-squinting",
        "sunset-gazing",
        # 14 bytes
        "zebra-pursuing", "marrow-sucking", "tongue-rasping", "river-crossing",
        "nose-wrinkling", "pride-greeting", "flank-pressing", "play-wrestling",
        "claw-extending", "water-sniffing", "deep-breathing",
        # 15 bytes
        "gazelle-chasing", "tree-scratching", "shadow-creeping", "vulture-shooing",
        "scent-following", "silent-stalking", "drowsy-blinking",
        # 16 bytes
        "savanna-crossing", "carcass-guarding", "grass-flattening", "neighbor-warning",
        "tracker-trotting", "kingdom-claiming",
        # 17 bytes
        "antelope-tackling", "whisker-twitching", "intruder-charging", "savanna-surveying",
    ],
    "tiger": [
        # 7 bytes
        "leaping", "roaring", "panting",
        # 8 bytes
        "pouncing", "chuffing", "growling", "snarling",
        "sleeping",
        # 9 bytes
        "ambushing",
        # 10 bytes
        "stretching",
        # 11 bytes
        "pug-marking", "neck-biting", "cub-licking", "fang-baring",
        "eye-glowing", "mud-rolling", "paw-flexing", "fur-licking",
        "log-jumping", "gut-pulling", "sun-warming",
        # 12 bytes
        "bark-clawing", "cub-carrying", "mate-calling", "ear-rotating",
        "dusk-hunting", "swamp-wading", "boar-chasing", "pelt-shaking",
        "dust-shaking", "rock-scaling", "cub-nuzzling", "head-rubbing",
        "tail-curling", "fern-pushing", "scat-marking", "hide-tearing",
        "head-shaking", "ear-flicking", "fly-swatting", "wind-reading",
        "cub-teaching",
        # 13 bytes
        "deer-stalking", "water-cooling", "scent-rubbing", "prey-dragging",
        "dawn-prowling", "shade-resting", "water-lapping", "prey-watching",
        "flank-bumping", "brush-parting", "leaf-rustling", "twig-stepping",
        "kill-guarding", "bone-cracking", "blood-licking", "water-bathing",
        "swim-paddling", "prey-circling", "kill-claiming",
        # 14 bytes
        "river-swimming", "urine-spraying", "rival-fighting", "bamboo-pushing",
        "silent-padding", "ravine-leaping", "ridge-climbing", "tail-twitching",
        "belly-crawling", "jackal-shooing", "meat-stripping", "shadow-melting",
        "scent-trailing", "brake-skidding", "tackle-rolling",
        # 15 bytes
        "stripe-flashing", "jungle-prowling", "claw-sharpening", "tree-scratching",
        "throat-clamping", "carcass-burying", "whisker-flexing", "tongue-grooming",
        "hind-stretching", "branch-snapping", "scratch-marking", "vulture-driving",
        "mosquito-biting", "moonlit-roaming", "sprint-bursting",
        # 16 bytes
        "mangrove-roaming", "buffalo-tackling", "slope-descending", "dappled-blending",
        "charge-launching",
        # 17 bytes
        "territory-walking", "foreleg-extending", "footprint-leaving", "midnight-prowling",
        # 18 bytes
        "mane-less-stalking",
    ],
    "elephant": [
        # 6 bytes
        "dozing",
        # 7 bytes
        "snoring",
        # 8 bytes
        "swimming", "dreaming", "sparring",
        # 10 bytes
        "trumpeting", "lying-down",
        # 11 bytes
        "log-rolling", "hay-tossing", "pond-wading", "ear-fanning",
        "sun-shading", "leaf-eating",
        # 12 bytes
        "ear-flapping", "dust-bathing", "tree-shoving", "bark-peeling",
        "calf-nudging", "tusk-digging", "salt-licking", "lake-bathing",
        "mud-spraying", "fly-swatting", "eye-blinking", "head-shaking",
        "head-bobbing", "calf-shading", "well-digging", "sand-digging",
        "branch-using", "fly-whisking", "tree-rubbing", "rock-pushing",
        "gate-lifting",
        # 13 bytes
        "mud-wallowing", "leaf-grabbing", "calf-guarding", "fruit-picking",
        "grass-pulling", "trunk-curling", "sand-throwing", "tail-swishing",
        "ear-listening", "trunk-twining", "calf-touching", "foot-stomping",
        "path-clearing", "slow-plodding", "fast-charging", "mock-charging",
        "mate-courting", "calf-suckling", "bone-touching", "ear-twitching",
        "water-finding", "latch-opening", "food-grabbing", "grass-grazing",
        "twig-snapping", "acacia-eating", "tusk-clashing", "herd-greeting",
        "calf-teaching",
        # 14 bytes
        "trunk-swinging", "water-spraying", "river-crossing", "herd-following",
        "mineral-mining", "trunk-snorting", "water-drinking", "trunk-greeting",
        "jungle-pushing", "musth-rumbling", "grave-visiting", "fence-toppling",
        "baobab-pushing", "thorn-avoiding", "tusk-polishing", "path-following",
        # 15 bytes
        "ground-rumbling", "root-uncovering", "ground-thumping", "savanna-walking",
        "calf-protecting", "back-scratching", "ritual-rumbling", "sunset-watching",
        "dawn-trumpeting",
        # 16 bytes
        "branch-stripping", "banana-gathering", "rival-trumpeting", "coconut-crushing",
        # 17 bytes
        "matriarch-leading", "threat-displaying", "sleeping-standing", "sugarcane-chewing",
        "migration-walking",
        # 18 bytes
        "infrasound-calling", "matriarch-mourning",
    ],
    "giraffe": [
        # 6 bytes
        "loping",
        # 7 bytes
        "kicking", "ambling", "chewing", "sipping",
        "calving",
        # 8 bytes
        "sparring", "slurping", "snorting", "sneezing",
        "coughing", "mounting",
        # 9 bytes
        "splashing",
        # 10 bytes
        "leg-pacing", "ruminating", "swallowing",
        # 11 bytes
        "sky-grazing", "sun-basking", "gait-pacing", "neck-arcing",
        "eye-rolling", "pod-chewing", "cud-chewing", "low-humming",
        # 12 bytes
        "neck-craning", "head-lifting", "twig-curling", "calf-licking",
        "knee-bending", "ear-rotating", "eye-blinking", "head-tossing",
        "fly-swatting", "tree-resting", "calf-nursing", "herd-joining",
        "dust-kicking", "head-bobbing", "sky-scanning", "neck-swaying",
        # 13 bytes
        "leaf-browsing", "neck-fighting", "neck-swinging", "head-clubbing",
        "calf-nuzzling", "leg-spreading", "lion-spotting", "tail-flicking",
        "shade-finding", "brief-napping", "calf-birthing", "calf-dropping",
        "river-fording", "hoof-clopping", "leaf-grasping", "mucus-coating",
        "twig-snapping", "flower-eating", "regurgitating", "calf-bleating",
        "urine-tasting", "mate-circling",
        # 14 bytes
        "branch-tasting", "herd-strolling", "slow-galloping", "water-splaying",
        "plain-crossing", "branch-bending", "fruit-plucking", "first-stepping",
        # 15 bytes
        "acacia-nibbling", "neck-stretching", "savanna-walking", "lash-fluttering",
        "journey-walking", "nostril-flaring", "breath-snorting", "mother-grunting",
        "flehmen-curling", "newborn-licking", "wobbly-standing", "gallop-escaping",
        # 16 bytes
        "tongue-stripping", "thorn-navigating", "treetop-reaching", "awkward-drinking",
        "ossicone-tilting", "oxpecker-letting", "mother-following", "lip-prehensiling",
        "tongue-extending", "thorn-protecting", "herd-introducing", "predator-fleeing",
        # 17 bytes
        "predator-watching", "sleeping-standing", "distance-spotting", "placenta-dropping",
        # 18 bytes
        "migration-trekking",
    ],
    "kangaroo": [
        # 6 bytes
        "boxing", "mating",
        # 7 bytes
        "hopping", "leaping", "kicking", "panting",
        "cooling", "weaning",
        # 8 bytes
        "bounding", "browsing", "sparring",
        # 9 bytes
        "sunbaking", "listening",
        # 10 bytes
        "slow-aging",
        # 11 bytes
        "paw-jabbing", "sun-basking", "mob-leading",
        # 12 bytes
        "joey-licking", "ear-rotating", "head-tilting", "dust-bathing",
        "hopping-fast", "slow-grazing", "joey-peeking", "dawn-grazing",
        "tree-dodging", "log-clearing", "fur-grooming", "alpha-boxing",
        "dust-rolling", "cool-digging", "root-digging", "dam-visiting",
        "fast-growing", "sniffing-air", "lip-smacking", "head-shaking",
        "head-cocking", "mob-watching",
        # 13 bytes
        "joey-cradling", "joey-grooming", "grass-grazing", "leaf-nibbling",
        "water-sipping", "shade-resting", "mob-gathering", "group-resting",
        "joey-suckling", "joey-emerging", "dusk-foraging", "foot-thumping",
        "fence-jumping", "road-crossing", "creek-leaping", "tail-dragging",
        "tail-propping", "mate-sniffing", "joey-birthing", "teat-latching",
        "rival-kicking", "dirt-clearing", "herb-foraging", "water-finding",
        # 14 bytes
        "tail-balancing", "pouch-carrying", "alert-standing", "chest-thumping",
        "pouch-cleaning", "alarm-stomping", "scrub-bounding", "ditch-crossing",
        "ear-scratching", "scent-checking", "tongue-licking", "teeth-grinding",
        "tail-twitching", "alert-freezing", "sunset-hopping",
        # 15 bytes
        "forearm-licking", "joey-leaping-in", "tripod-standing", "hind-scratching",
        "female-courting", "paddock-roaming", "grooming-sister", "grooming-mother",
        "sleeping-curled",
        # 16 bytes
        "upright-perching", "pouch-stretching", "mother-following", "courtship-pawing",
        "pouch-developing", "drought-enduring",
        # 17 bytes
        "nighttime-feeding", "predator-thumping", "big-joey-bouncing", "eucalyptus-eating",
        # 18 bytes
        "outback-traversing",
    ],
    "dolphin": [
        # 6 bytes
        "mating",
        # 7 bytes
        "leaping", "surfing", "logging", "resting",
        "helping", "weaning",
        # 8 bytes
        "clicking",
        # 9 bytes
        "breaching", "whistling",
        # 10 bytes
        "bow-riding", "lobtailing", "porpoising",
        # 11 bytes
        "wave-riding", "mud-ringing", "deep-diving", "eye-closing",
        "spy-hopping", "head-rising", "periscoping", "eye-meeting",
        # 12 bytes
        "echolocating", "fish-herding", "fish-tossing", "sponge-using",
        "calf-nursing", "pod-swimming", "body-rubbing", "jaw-clapping",
        "eye-watching", "calf-pushing", "kelp-playing", "fish-chasing",
        "ray-flipping", "corkscrewing", "tail-walking", "male-pairing",
        "name-calling", "dawn-feeding",
        # 13 bytes
        "prey-stunning", "tool-foraging", "calf-guarding", "mate-courting",
        "belly-rubbing", "fluke-pumping", "tail-slapping", "squid-hunting",
        "shark-mobbing", "ring-swimming", "slow-cruising", "fast-charging",
        "somersaulting", "fluke-walking", "calf-teaching", "milk-suckling",
        # 14 bytes
        "bubble-blowing", "bubble-netting", "sand-shoveling", "holding-breath",
        "calf-defending", "barrel-rolling", "full-breaching", "splash-landing",
        "dorsal-cutting", "wake-following", "boat-escorting", "diver-circling",
        "social-bonding", "sleep-swimming",
        # 15 bytes
        "school-circling", "surface-lifting", "seaweed-tossing", "octopus-chasing",
        "calf-imprinting",
        # 16 bytes
        "jellyfish-poking", "herring-bursting", "predator-fending", "gentle-surfacing",
        "flipper-touching", "alliance-forming", "group-vocalizing",
        # 17 bytes
        "pectoral-stroking", "blowhole-exhaling", "surface-breathing", "mackerel-catching",
        "formation-leaping",
        # 18 bytes
        "formation-cruising", "vertical-launching", "gestation-swimming", "friend-recognizing",
    ],
    "octopus": [
        # 6 bytes
        "hiding", "mating",
        # 7 bytes
        "probing",
        # 8 bytes
        "gripping", "learning",
        # 9 bytes
        "releasing", "squeezing", "exploring", "deflating",
        "expanding", "senescing", "signaling", "mimicking",
        # 10 bytes
        "paralyzing",
        # 11 bytes
        "jar-opening", "beak-biting", "arm-curling", "arm-walking",
        "eggs-laying", "egg-tending", "egg-fanning", "lid-lifting",
        "eel-fleeing",
        # 12 bytes
        "camouflaging", "den-crafting", "lid-twisting", "eight-arming",
        "eye-rotating", "blue-blooded", "mate-finding", "regenerating",
        # 13 bytes
        "ink-squirting", "rock-stacking", "coconut-using", "tool-wielding",
        "prey-stalking", "crab-grabbing", "fish-pouncing", "multi-tasking",
        "water-jetting", "debris-piling", "arm-regrowing",
        # 14 bytes
        "jet-propelling", "color-changing", "taste-touching", "mantle-pumping",
        "gill-breathing", "escape-jetting", "bottom-walking", "sand-burrowing",
        "brood-guarding", "growth-molting", "shooting-water", "shark-avoiding",
        "color-flashing", "threat-flaring",
        # 15 bytes
        "problem-solving", "maze-navigating", "venom-injecting", "body-flattening",
        "knuckle-walking", "reef-traversing", "watching-divers", "dolphin-dodging",
        "fish-partnering", "pattern-pulsing",
        # 16 bytes
        "texture-shifting", "shell-collecting", "shrimp-snatching", "mollusk-cracking",
        "suckers-sticking", "chemical-sensing", "garden-arranging", "post-spawn-dying",
        "predator-eluding",
        # 17 bytes
        "lobster-wrestling", "crevice-squeezing", "tiny-hole-fitting", "oxygen-extracting",
        "juvenile-hatching", "plankton-floating", "recognizing-faces", "aquarium-escaping",
        "neighbor-grabbing", "prey-tank-raiding",
        # 18 bytes
        "tentacle-extending", "ink-cloud-creating", "courtship-touching", "paralarva-drifting",
        "flatfish-imitating",
    ],
    "penguin": [
        # 6 bytes
        "mating",
        # 7 bytes
        "sliding", "molting", "calling", "braying",
        "panting",
        # 8 bytes
        "waddling", "huddling", "rotating", "swimming",
        "preening", "creching",
        # 10 bytes
        "porpoising", "trumpeting", "vocalizing",
        # 11 bytes
        "tobogganing", "ice-walking", "ice-leaping", "sun-basking",
        "ice-cooling", "wind-facing", "fat-storing",
        # 12 bytes
        "ocean-diving", "fish-chasing", "neck-arching", "pair-bonding",
        "skua-fending", "gull-shooing", "head-bobbing", "sky-pointing",
        "eye-blinking", "snow-rolling", "divorce-rare",
        # 13 bytes
        "snow-trekking", "egg-balancing", "chick-feeding", "regurgitating",
        "fish-bringing", "deep-plunging", "krill-gulping", "exit-bursting",
        "oil-spreading", "nest-building", "beak-pointing", "slap-fighting",
        "cold-enduring", "fast-enduring", "weight-losing", "cliff-leaping",
        "beach-landing", "salt-sneezing",
        # 14 bytes
        "belly-flopping", "warmth-sharing", "squid-pursuing", "breath-holding",
        "stone-stealing", "chick-guarding", "ocean-entering", "storm-huddling",
        "march-trekking", "shift-changing", "chick-fledging", "surf-launching",
        # 15 bytes
        "foot-incubating", "surface-leaping", "partner-finding", "walking-upright",
        "route-following", "adult-returning",
        # 16 bytes
        "krill-delivering", "flipper-flapping", "courtship-bowing", "mate-recognizing",
        "pebble-gathering", "neighbor-pecking", "fight-flippering", "group-protecting",
        "ice-edge-leaping", "heat-dissipating", "colony-returning", "parent-relieving",
        "juvenile-leaving", "lifelong-pairing",
        # 17 bytes
        "underwater-flying", "torpedo-launching", "chick-recognizing", "colony-navigating",
        "threat-displaying", "predator-watching", "sleeping-standing", "flipper-spreading",
        "first-swim-taking",
        # 18 bytes
        "shoreline-arriving",
    ],
    "cheetah": [
        # 7 bytes
        "braking", "panting", "cooling", "gulping",
        "fleeing", "weaning", "leaping",
        # 8 bytes
        "stalking", "scanning", "sniffing", "pouncing",
        "eat-fast",
        # 9 bytes
        "sprinting", "cornering", "listening", "gestating",
        "wrestling",
        # 10 bytes
        "recovering", "abandoning", "den-hiding",
        # 11 bytes
        "eye-locking", "cub-leading", "fast-eating", "slim-bodied",
        "eye-glaring",
        # 12 bytes
        "accelerating", "prey-chasing", "dust-kicking", "tree-resting",
        "log-perching", "cub-teaching", "dawn-hunting", "lion-fleeing",
        "lean-running", "head-lifting", "ear-rotating", "tree-clawing",
        "mating-brief", "cub-birthing", "cub-guarding", "milk-nursing",
        "cub-stalking", "mock-chasing", "climbing-low",
        # 13 bytes
        "ground-eating", "flexing-spine", "claws-griping", "tail-rudderng",
        "sharp-turning", "low-crouching", "prey-spotting", "target-fixing",
        "range-closing", "shade-seeking", "kill-hurrying", "urine-marking",
        "scrape-making", "lair-changing", "tail-grabbing", "prey-grabbing",
        "retreat-quick",
        # 14 bytes
        "hunt-launching", "burst-charging", "scout-mounding", "hyena-yielding",
        "slender-pacing", "alert-standing", "scent-checking", "cub-relocating",
        "mouth-carrying",
        # 15 bytes
        "impala-tackling", "semi-retracting", "mother-tracking", "daylight-active",
        "brother-bonding", "group-defending", "female-courting", "scruff-grasping",
        "hunt-practicing", "sibling-playing", "recovering-fall", "throat-clamping",
        # 16 bytes
        "gazelle-pursuing", "stride-extending", "vantage-claiming", "vulture-watching",
        "predator-evading", "prey-introducing", "mid-run-tripping",
        # 17 bytes
        "top-speed-running",
        # 18 bytes
        "hunt-demonstrating", "nocturnal-avoiding", "live-prey-teaching", "suffocation-biting",
    ],
    "koala": [
        # 6 bytes
        "dozing",
        # 7 bytes
        "panting", "peeking", "weaning",
        # 8 bytes
        "latching", "emerging",
        # 9 bytes
        "bellowing", "surviving", "gestating",
        # 10 bytes
        "descending", "scratching",
        # 11 bytes
        "slow-moving", "ear-tufting", "back-riding", "pap-feeding",
        "sun-basking", "paw-licking",
        # 12 bytes
        "leaf-chewing", "tree-hugging", "eyes-closing", "fur-grooming",
        "ear-flicking", "fly-swatting", "rain-soaking", "fur-fluffing",
        "fur-cleaning", "joey-licking", "brief-mating", "teat-finding",
        "picky-eating", "dawn-feeding",
        # 13 bytes
        "fork-sleeping", "nose-sniffing", "claw-gripping", "bark-clinging",
        "dingo-fearing", "deep-grunting", "joey-carrying", "pouch-housing",
        "joey-clinging", "limb-dangling", "scent-marking", "tree-branding",
        "mate-mounting",
        # 14 bytes
        "leaf-selecting", "mating-calling", "leaf-hydrating", "weaning-slowly",
        "exploring-back", "leaving-mother", "shoot-favoring", "wild-returning",
        # 15 bytes
        "branch-perching", "awkward-walking", "claw-sharpening", "heat-sweltering",
        "mother-clinging", "returning-pouch", "rehab-receiving", "rescue-clinging",
        # 16 bytes
        "liver-processing", "ground-shuffling", "drought-enduring", "pouch-developing",
        "manna-gum-eating", "blue-gum-tasting", "bushfire-fleeing", "treetop-trapping",
        "recovery-resting", "blanket-gripping", "release-climbing",
        # 17 bytes
        "gum-tree-climbing", "energy-conserving", "sleeping-20-hours", "toxin-detoxifying",
        "slow-metabolizing", "vertical-climbing", "branch-stretching", "female-tolerating",
        "slowly-recovering",
        # 18 bytes
        "tree-trunk-cooling", "species-preferring",
    ],
    "panda": [
        # 6 bytes
        "dozing",
        # 7 bytes
        "sitting", "yawning", "ambling", "denning",
        "weaning", "honking", "huffing",
        # 8 bytes
        "lounging", "sleeping", "bleating", "chirping",
        "chomping", "sneezing",
        # 9 bytes
        "slouching",
        # 10 bytes
        "stretching", "cub-hiding", "retrieving",
        # 11 bytes
        "leaf-eating", "paw-licking", "cub-rolling", "cub-licking",
        "mating-rare", "cub-warming", "log-rolling", "snow-pawing",
        "slow-living",
        # 12 bytes
        "back-rolling", "fork-napping", "fur-grooming", "cub-cradling",
        "cub-bouncing", "snow-rolling", "snow-sliding", "slow-walking",
        "river-wading", "jaw-grinding", "scat-leaving", "tree-rubbing",
        "mate-finding", "cub-birthing", "milk-nursing", "cub-fetching",
        "cub-crawling", "head-tilting", "fur-fluffing",
        # 13 bytes
        "tree-climbing", "gentle-pawing", "somersaulting", "stalk-peeling",
        "scent-marking", "urine-marking", "foot-flopping", "fruit-finding",
        "holding-stalk", "ear-twitching",
        # 14 bytes
        "stalk-cracking", "branch-resting", "water-drinking", "stream-sipping",
        "mouth-carrying", "mother-leaving", "chewing-loudly", "two-paw-eating",
        "nose-wrinkling", "sunset-resting",
        # 15 bytes
        "bamboo-munching", "shoot-stripping", "belly-sprawling", "bamboo-gripping",
        "fiber-crunching", "brief-courtship", "gentle-grasping", "cub-fur-growing",
        "juvenile-eating", "solitary-living", "pillar-clinging", "sitting-upright",
        # 16 bytes
        "playful-tumbling", "mountain-roaming", "forest-wandering", "cub-eyes-opening",
        "cub-climbing-mom", "carrot-crunching", "biscuit-nibbling",
        # 17 bytes
        "mother-protecting", "tiny-cub-cradling", "cub-licking-clean", "ice-block-licking",
        # 18 bytes
        "handstand-spraying", "neighbor-detecting", "bamboo-introducing", "range-establishing",
        "keeper-recognizing", "eye-patch-blinking",
    ],
    "wolf": [
        # 6 bytes
        "loping",
        # 7 bytes
        "howling", "denning", "burying",
        # 8 bytes
        "growling", "snarling", "snapping", "trotting",
        # 9 bytes
        "listening",
        # 10 bytes
        "retrieving", "eye-fixing",
        # 11 bytes
        "harmonizing", "elk-chasing", "fang-baring", "play-bowing",
        "pup-licking", "pup-nursing", "pup-feeding", "mile-eating",
        "dusk-active", "pack-piling",
        # 12 bytes
        "pack-singing", "lone-howling", "mate-calling", "tail-tucking",
        "tail-wagging", "mate-bonding", "pup-birthing", "pup-guarding",
        "food-caching", "ear-rotating", "dawn-hunting", "fur-grooming",
        "mate-licking", "face-licking", "mate-seeking", "tree-marking",
        "scat-leaving", "kill-sharing",
        # 13 bytes
        "prey-tracking", "snow-trekking", "deer-pursuing", "bison-testing",
        "kill-securing", "alpha-leading", "neck-grabbing", "regurgitating",
        "prey-bringing", "prey-watching", "steady-pacing", "urine-marking",
        "scrape-making", "bone-cracking",
        # 14 bytes
        "scent-trailing", "moose-circling", "weak-targeting", "omega-yielding",
        "ear-flattening", "frolic-running", "pup-relocating", "mouth-carrying",
        "sniff-locating", "alert-standing", "ridge-scanning", "warmth-sharing",
        "pup-tolerating", "lone-wandering", "marrow-licking",
        # 15 bytes
        "flank-attacking", "throat-grabbing", "dominant-eating", "beta-supporting",
        "valley-watching", "gallop-charging", "sleeping-curled", "social-greeting",
        "muzzle-nuzzling", "raven-following",
        # 16 bytes
        "group-vocalizing", "hamstring-biting", "threat-bristling", "lifelong-pairing",
        "lookout-perching", "new-pack-finding", "neighbor-warning", "raven-tolerating",
        # 17 bytes
        "territory-calling", "caribou-following", "pack-coordinating", "formation-running",
        "hierarchy-feeding", "nocturnal-roaming", "dispersal-leaving", "intruder-fighting",
        # 18 bytes
        "deep-snow-bounding", "dominance-mounting", "tail-covering-nose", "territory-claiming",
        "scavenger-allowing",
    ],
    "eagle": [
        # 6 bytes
        "lining",
        # 7 bytes
        "soaring", "gliding", "calling",
        # 8 bytes
        "circling", "brooding", "hatching", "fledging",
        "perching", "preening", "mantling",
        # 10 bytes
        "plummeting", "copulating", "incubating", "screeching",
        # 11 bytes
        "sky-dancing", "eggs-laying", "eyes-fixing", "wing-drying",
        # 12 bytes
        "wing-folding", "stoop-diving", "decade-using", "cartwheeling",
        "mate-bonding", "prey-tearing", "first-flying", "eye-scanning",
        "prey-locking", "neck-cocking", "dust-bathing",
        # 13 bytes
        "slot-creating", "lift-catching", "hover-pausing", "lake-skimming",
        "river-fishing", "branch-adding", "mate-bringing", "hunt-learning",
        "snag-gripping", "head-rotating", "beak-cleaning", "sun-spreading",
        "raven-fending", "talon-locking", "pair-greeting",
        # 14 bytes
        "thermal-riding", "wing-spreading", "height-gaining", "fish-snatching",
        "trout-plucking", "eyrie-building", "stick-stacking", "eaglet-feeding",
        "beak-shredding", "eaglet-growing", "branch-walking", "cliff-roosting",
        "feather-oiling", "bath-splashing", "prey-shielding", "food-defending",
        "osprey-robbing", "falcon-mobbing", "eagle-fighting", "parent-calling",
        "perch-changing", "riding-updraft",
        # 15 bytes
        "feather-fanning", "salmon-grabbing", "rabbit-pouncing", "nest-renovating",
        "prey-presenting", "talon-grappling", "awkward-landing", "midair-fighting",
        "sunset-roosting",
        # 16 bytes
        "talons-extending", "surface-grabbing", "lifelong-pairing", "chick-portioning",
        "smaller-favoring", "parent-following", "immature-roaming", "treetop-watching",
        "telephoto-vision", "distant-spotting", "mate-recognizing", "stretch-flapping",
        "climbing-quickly",
        # 17 bytes
        "primary-spreading", "courtship-locking", "golden-shimmering", "fledgling-begging",
        "takeoff-thrusting",
        # 18 bytes
        "plumage-developing", "kleptoparasitizing", "pre-dawn-launching",
    ],
    "otter": [
        # 7 bytes
        "hissing", "chasing", "surfing",
        # 8 bytes
        "twirling", "spinning", "fluffing", "growling",
        "gripping", "scarring",
        # 9 bytes
        "squeaking", "whistling", "gestating", "wrestling",
        # 11 bytes
        "anvil-using", "mud-rooting", "sun-basking", "deep-diving",
        "holding-pup", "pup-nursing", "biting-nose", "mud-sliding",
        "wave-riding", "paw-rubbing", "eye-rubbing", "dawn-active",
        # 12 bytes
        "hand-holding", "belly-eating", "clam-digging", "fur-grooming",
        "air-trapping", "dive-bobbing", "pup-cradling", "pup-grooming",
        "pup-fluffing", "pup-teaching", "pup-floating", "mate-calling",
        "pup-birthing", "holt-denning", "foam-playing", "face-washing",
        "ear-cleaning",
        # 13 bytes
        "belly-sliding", "somersaulting", "water-playing", "splash-making",
        "rock-cracking", "urchin-eating", "kelp-wrapping", "raft-floating",
        "group-rafting", "back-floating", "crab-catching", "fish-snapping",
        "eel-wrestling", "frog-grabbing", "rock-perching", "waterproofing",
        "scent-marking", "latrine-using", "family-living", "mock-fighting",
        "tail-grabbing", "fish-stashing", "prey-pursuing", "dusk-foraging",
        # 14 bytes
        "river-swimming", "abalone-prying", "chest-cracking", "log-clambering",
        "breath-holding", "kelp-anchoring", "bubble-blowing", "group-foraging",
        # 15 bytes
        "tail-propelling", "mussel-smashing", "sibling-playing", "current-resting",
        "family-greeting",
        # 16 bytes
        "mother-anchoring", "otter-chittering", "snowbank-sliding", "repeated-sliding",
        "food-pile-making",
        # 17 bytes
        "shellfish-opening", "courtship-rolling", "mating-aggressive", "slide-tobogganing",
        "food-sharing-rare",
        # 18 bytes
        "sea-floor-checking", "single-pup-raising", "multiple-entrances",
    ],
    "rhinoceros": [
        # 6 bytes
        "goring", "mating",
        # 7 bytes
        "rolling",
        # 8 bytes
        "charging", "snorting", "plodding", "scarring",
        # 9 bytes
        "listening",
        # 10 bytes
        "scattering",
        # 11 bytes
        "mud-coating", "path-making", "dung-piling", "log-rubbing",
        # 12 bytes
        "dust-kicking", "head-tossing", "head-shaking", "ear-rotating",
        "wind-tasting", "dust-bathing", "horn-jabbing", "slow-walking",
        "fast-running", "calf-licking", "weaning-slow", "lion-fending",
        "side-resting", "dawn-grazing",
        # 13 bytes
        "horn-lowering", "mock-charging", "scent-relying", "mud-wallowing",
        "grass-grazing", "twig-snapping", "bone-cracking", "tree-toppling",
        "trail-walking", "surprise-fast", "bull-fighting", "horn-clashing",
        "calf-birthing", "calf-suckling", "crash-forming", "mate-courting",
        "hyena-warding", "fence-walking", "head-pressing", "mock-fighting",
        "snore-puffing",
        # 14 bytes
        "wheeze-puffing", "sun-protecting", "browse-nipping", "leaf-stripping",
        "water-drinking", "river-crossing", "calf-following", "calf-defending",
        "scrape-marking", "mate-following", "gestating-long", "horn-polishing",
        "sleeping-lying",
        # 15 bytes
        "branch-nibbling", "bush-flattening", "gallop-charging", "scent-spreading",
        "solitary-living", "female-circling", "calf-protecting", "tree-scratching",
        "moonlit-grazing",
        # 16 bytes
        "lip-prehensiling", "vehicle-flipping", "neighbor-warning", "microchip-living",
        "mud-pool-soaking", "sunset-wallowing", "twilight-walking",
        # 17 bytes
        "ground-thundering", "threat-displaying", "mother-protecting", "predator-charging",
        "ranger-tolerating", "sanctuary-grazing", "calf-playing-rare", "sleeping-standing",
        # 18 bytes
        "charging-defenders", "dust-trail-leaving", "territory-claiming", "courtship-snorting",
        "mock-charging-game",
    ],
    "hippopotamus": [
        # 7 bytes
        "yawning", "weaning",
        # 8 bytes
        "scarring",
        # 9 bytes
        "bellowing", "gestating",
        # 10 bytes
        "jaw-gaping",
        # 11 bytes
        "mud-bathing", "lip-pulling", "lawn-making",
        # 12 bytes
        "pod-grouping", "milk-feeding", "boat-tipping", "gape-warning",
        "dusk-grazing", "first-breath", "lion-fending", "tusk-showing",
        "cow-courting", "mating-water",
        # 13 bytes
        "calf-guarding", "fast-charging", "lion-charging", "bull-fighting",
        "tusk-clashing", "deep-wounding", "dung-spinning", "tail-flicking",
        "dung-spraying", "scent-marking", "deep-grunting", "night-feeding",
        "path-stomping", "fish-cleaning", "calf-paddling", "calf-creching",
        # 14 bytes
        "breath-holding", "walking-bottom", "hippo-trotting", "wheeze-honking",
        "grass-cropping", "mother-bonding", "alarm-snorting", "jaw-stretching",
        "river-changing", "mud-conserving",
        # 15 bytes
        "river-wallowing", "returning-water", "daytime-soaking", "skin-protecting",
        "surface-pushing", "pod-introducing", "nostril-closing", "wallow-rotating",
        "sunset-emerging",
        # 16 bytes
        "tooth-displaying", "water-submerging", "calf-back-riding", "surprise-running",
        "crocodile-biting", "pod-coordinating", "group-protecting", "predator-mobbing",
        "drying-sun-brief", "new-pod-fighting",
        # 17 bytes
        "surface-eyes-only", "threat-displaying", "big-bull-evicting", "bachelor-grouping",
        "female-pod-living", "matriarch-leading", "automatic-sealing", "lone-bull-roaming",
        "drought-suffering", "deep-pool-seeking",
        # 18 bytes
        "periscope-watching", "territory-claiming", "dawn-leaving-water", "sunrise-submerging",
        "water-rushing-back",
    ],
    "zebra": [
        # 6 bytes
        "biting",
        # 7 bytes
        "kicking", "rearing", "rolling", "bucking",
        # 8 bytes
        "fighting", "scarring",
        # 9 bytes
        "galloping", "listening",
        # 11 bytes
        "head-laying", "sun-basking", "dusk-active", "fast-tiring",
        # 12 bytes
        "herd-running", "ear-rotating", "head-lifting", "fly-swatting",
        "neck-resting", "hind-kicking", "taking-turns", "dust-bathing",
        "dawn-grazing", "foal-running", "foal-playing", "head-tossing",
        "mane-shaking", "pace-setting",
        # 13 bytes
        "grass-grazing", "tail-swishing", "mare-grouping", "harem-staying",
        "foal-guarding", "drowning-risk", "lion-spotting", "hyena-fending",
        "alarm-barking", "line-drinking", "mud-wallowing", "shade-seeking",
        "tail-flagging", "lion-injuring", "route-knowing", "water-finding",
        "plain-roaming",
        # 14 bytes
        "alert-standing", "social-bonding", "harem-stealing", "neck-wrestling",
        "river-crossing", "panic-bursting", "kweeha-calling", "mare-nickering",
        "midday-resting",
        # 15 bytes
        "stripe-flashing", "mutual-grooming", "foal-imprinting", "foal-whickering",
        "contact-calling", "moonlit-grazing", "herd-protecting", "escape-bursting",
        "sprint-bounding", "sunrise-grazing",
        # 16 bytes
        "dazzle-confusing", "head-down-eating", "bot-fly-stomping", "withers-nibbling",
        "mother-following", "mare-recognizing", "scent-imprinting", "current-fighting",
        "herd-recognizing", "kicking-up-heels", "sibling-tussling", "defensive-circle",
        # 17 bytes
        "bachelor-grouping", "stallion-clashing", "crocodile-fearing", "exhausted-resting",
        "predator-watching", "stallion-snorting", "sentinel-watching", "kicking-attackers",
        "drought-surviving",
        # 18 bytes
        "young-male-roaming", "migration-trekking", "thermal-regulating", "alpha-mare-leading",
        "savanna-traversing",
    ],
    "falcon": [
        # 6 bytes
        "diving", "kiting",
        # 7 bytes
        "mobbing", "banking", "evading",
        # 8 bytes
        "stooping", "perching", "brooding", "plucking",
        "fledging", "mantling", "preening",
        # 9 bytes
        "screaming", "kill-grip", "prey-prep",
        # 10 bytes
        "plummeting", "eye-fixing", "incubating", "copulating",
        "sunbathing", "stretching",
        # 11 bytes
        "wind-facing", "eggs-laying", "sky-dancing", "fast-flying",
        "eye-closing",
        # 12 bytes
        "wing-tucking", "head-bobbing", "eyas-feeding", "beak-tearing",
        "cache-hiding", "mate-feeding", "mate-binding", "eyas-begging",
        "glide-mixing", "foot-warming", "head-tucking",
        # 13 bytes
        "prey-striking", "duck-tackling", "hovering-rare", "hover-hunting",
        "kestrel-style", "gravel-laying", "talon-holding", "raven-fending",
        "hunt-learning", "turning-tight", "water-dipping", "oil-spreading",
        # 14 bytes
        "midair-killing", "bird-snatching", "ledge-watching", "cliff-roosting",
        "scrape-nesting", "prey-shredding", "larder-keeping", "urban-thriving",
        "talons-binding", "prey-clutching", "severing-spine", "food-shielding",
        "bath-splashing", "wing-spreading", "dawn-launching",
        # 15 bytes
        "pigeon-grabbing", "ledge-defending", "kak-kak-calling", "awkward-landing",
        "branch-flapping", "adult-acquiring", "pigeon-feasting", "eating-on-perch",
        "feather-zipping",
        # 16 bytes
        "sparrow-catching", "distant-spotting", "parallax-judging", "courtship-aerial",
        "immature-roaming", "plumage-changing", "level-speed-fast", "sleeping-perched",
        # 17 bytes
        "telescopic-vision", "intruder-stooping", "perching-watching", "agile-maneuvering",
        "plucking-feathers",
        # 18 bytes
        "parent-recognizing", "food-pass-catching", "wing-beating-rapid",
    ],
    "walrus": [
        # 8 bytes
        "swimming", "drifting",
        # 9 bytes
        "whistling", "bellowing", "migrating",
        # 10 bytes
        "tusk-using",
        # 11 bytes
        "ice-hauling", "ice-pulling", "herd-piling", "mud-bathing",
        "sun-basking", "deep-diving", "fat-storing",
        # 12 bytes
        "mating-water", "tusk-jamming", "orca-fleeing", "vasodilating",
        "dive-lessons", "tusk-growing", "body-rolling", "chin-resting",
        "eye-blinking",
        # 13 bytes
        "bull-fighting", "tusk-clashing", "group-hauling", "body-stacking",
        "sand-flopping", "clam-foraging", "water-jetting", "claw-scraping",
        "ice-anchoring", "calf-suckling", "ivory-coveted", "pink-flushing",
        "blood-warming", "jaw-extending", "ice-following", "fast-enduring",
        # 14 bytes
        "body-anchoring", "knocking-sound", "beach-crowding", "warmth-sharing",
        "bottom-grazing", "hunter-fearing", "walrus-yawning", "stranding-rare",
        # 15 bytes
        "tusk-displaying", "harem-defending", "female-courting", "blubber-warming",
        "prey-uncovering", "suction-feeding", "calf-protecting", "cold-water-pale",
        "throat-pouching", "ice-floe-riding", "mother-teaching", "dozing-floating",
        # 16 bytes
        "shivering-rarely", "sediment-blowing", "whisker-sweeping", "ice-edge-resting",
        "calf-back-riding", "mother-defending", "group-protecting", "predator-mobbing",
        "fish-rare-eating", "juvenile-growing", "slow-reproducing", "biennial-calving",
        "scratching-tusks",
        # 17 bytes
        "courtship-calling", "mollusk-vacuuming", "whisker-detecting", "vibrissae-sensing",
        "hole-keeping-open", "indigenous-hunted", "winter-ice-living", "calf-birthing-ice",
        "wobbly-first-swim",
        # 18 bytes
        "underwater-singing", "polar-bear-fearing", "charging-defenders", "warm-pink-flushing",
        "blubber-thickening",
    ],
    "platypus": [
        # 7 bytes
        "lapping",
        # 8 bytes
        "hatching",
        # 9 bytes
        "gestating", "body-slim", "fur-dense", "brief-air",
        # 10 bytes
        "swallowing",
        # 11 bytes
        "mud-rooting", "ear-closing", "leaf-lining", "eggs-laying",
        "eye-rubbing",
        # 12 bytes
        "bill-probing", "worm-pulling", "baby-licking", "mating-water",
        "tow-swimming",
        # 13 bytes
        "dive-foraging", "swim-emerging", "male-spurring", "leathery-eggs",
        "bill-cleaning", "dawn-foraging", "dusk-emerging", "holding-cheek",
        # 14 bytes
        "swimming-blind", "larva-snapping", "cheek-pouching", "river-swimming",
        "burrow-digging", "milk-secreting", "first-foraging", "mother-leaving",
        "rival-fighting", "cold-resisting", "low-vocalizing",
        # 15 bytes
        "nostril-sealing", "bill-using-only", "shrimp-grabbing", "surface-chewing",
        "stream-foraging", "nesting-chamber", "solitary-living", "venom-injecting",
        "debris-checking", "freshwater-only", "refugia-seeking", "dual-sense-bill",
        "bottom-sweeping", "zigzag-swimming", "gravel-grinding",
        # 16 bytes
        "bottom-snuffling", "milk-pooling-fur", "oily-fur-shaking", "dry-fur-grooming",
        "sun-basking-rare", "nocturnal-active", "returning-bottom",
        # 17 bytes
        "no-teeth-grinding", "gravel-using-mill", "incubating-curled", "log-investigating",
        "drought-suffering", "side-to-side-bill", "pendulum-foraging", "fast-prey-capture",
        "surface-breathing",
        # 18 bytes
        "pouch-storing-prey", "courtship-circling", "waterproof-coating", "climate-threatened",
        "bill-sensing-touch", "bill-grub-grabbing", "surface-processing", "scent-leaving-rare",
        "growling-defensive",
    ],
    "bear": [
        # 7 bytes
        "ambling", "huffing", "woofing", "roaring",
        "bawling", "denning", "gorging", "weaning",
        # 8 bytes
        "charging", "growling",
        # 9 bytes
        "lumbering", "refeeding",
        # 11 bytes
        "log-rolling", "grub-eating", "ant-licking", "jaw-popping",
        "hibernating", "fat-burning", "cub-nursing", "mud-bathing",
        "log-walking", "sun-basking", "day-bedding", "cub-leading",
        # 12 bytes
        "paw-scooping", "hive-tearing", "log-flipping", "body-cooling",
        "claw-marking", "dust-rolling", "snow-walking", "snow-rolling",
        "sniffing-air", "cub-teaching",
        # 13 bytes
        "fast-charging", "fish-grabbing", "river-fishing", "jaw-snatching",
        "berry-picking", "honey-raiding", "tree-climbing", "sow-defending",
        "mock-charging", "pawing-ground", "heart-slowing", "kill-claiming",
        "scent-marking", "river-cooling", "swim-crossing", "lake-paddling",
        "fish-pursuing", "scree-sliding", "shade-resting", "brush-bedding",
        "food-stealing",
        # 14 bytes
        "gallop-running", "bee-tolerating", "cub-protecting", "teeth-clacking",
        "mother-warming", "fall-fattening", "rub-tree-using", "hidden-resting",
        "alert-standing",
        # 15 bytes
        "salmon-swatting", "branch-perching", "whimpering-cubs", "torpor-entering",
        "spring-emerging", "lean-staggering", "weight-doubling", "salmon-feasting",
        "wolf-displacing", "hind-leg-rising", "garbage-raiding", "problem-bearing",
        "brief-courtship",
        # 16 bytes
        "cub-tree-sending", "slope-traversing", "alpine-meadowing", "climbing-showing",
        # 17 bytes
        "raspberry-grazing", "cubs-birthing-den", "elk-calf-grabbing", "height-displaying",
        "mountain-climbing", "campsite-checking", "solitary-becoming", "mate-finding-rare",
        # 18 bytes
        "hyperphagia-eating", "carrion-scavenging",
    ],
    "fox": [
        # 7 bytes
        "mousing",
        # 8 bytes
        "pouncing", "locating", "freezing", "blending",
        # 9 bytes
        "den-using", "gekkering",
        # 10 bytes
        "ever-alert",
        # 11 bytes
        "snow-diving", "kit-feeding", "kit-playing", "ear-nipping",
        "play-bowing", "trail-using", "dusk-active", "dog-evading",
        "mating-call", "kit-whining",
        # 12 bytes
        "ear-rotating", "head-tilting", "mock-hunting", "tail-chasing",
        "scat-leaving", "bark-yipping", "fur-fluffing", "nest-raiding",
        # 13 bytes
        "snow-bursting", "vole-catching", "mouse-tossing", "regurgitating",
        "prey-bringing", "tail-fluffing", "scent-marking", "dawn-prowling",
        "eagle-fearing", "snow-trotting", "brief-resting", "sharp-turning",
        # 14 bytes
        "audial-hunting", "prey-snatching", "rabbit-chasing", "urine-spraying",
        "urban-thriving", "cat-coexisting", "alarm-coughing", "coyote-fleeing",
        "light-sleeping", "dispersal-fall", "lone-traveling",
        # 15 bytes
        "vixen-mothering", "compost-raiding", "vixen-screaming", "contact-calling",
        "summer-shedding", "sleeping-curled",
        # 16 bytes
        "leaping-vertical", "burrow-co-opting", "sibling-tussling", "brush-displaying",
        "garden-pillaging", "human-tolerating", "fight-vocalizing", "predator-warning",
        "sun-bathing-rare", "omnivore-flexing", "careful-stalking",
        # 17 bytes
        "listening-rodents", "dog-fox-providing", "pounce-practicing", "big-ear-listening",
        "nose-tail-tucking", "fruit-eating-fall", "bird-egg-stealing",
        # 18 bytes
        "white-tip-flagging", "nocturnal-foraging", "red-fur-displaying", "golden-eye-glowing",
        "tail-wrapping-face",
    ],
    "owl": [
        # 7 bytes
        "hooting", "barking", "hissing",
        # 8 bytes
        "swooping", "preening",
        # 9 bytes
        "branching",
        # 10 bytes
        "eye-fixing", "screeching",
        # 11 bytes
        "dawn-active",
        # 12 bytes
        "rat-tackling", "neck-flexing", "body-puffing", "camouflaging",
        "hollow-using", "prey-tearing", "first-flight", "head-bobbing",
        "eating-whole", "duet-hooting", "mate-bonding", "dust-bathing",
        # 13 bytes
        "silent-flying", "vole-grabbing", "night-hunting", "dusk-foraging",
        "beak-clacking", "snag-roosting", "owlet-feeding", "owlet-growing",
        "hunt-learning", "depth-judging", "winter-saving", "hearing-acute",
        "oil-spreading",
        # 14 bytes
        "hovering-pause", "talon-grabbing", "prey-snatching", "mouse-catching",
        "wing-spreading", "perching-still", "cavity-nesting", "oldest-largest",
        "beak-shredding", "pellet-casting", "parallax-using", "snow-listening",
        "kill-immediate", "larder-keeping",
        # 15 bytes
        "ground-pouncing", "rabbit-pouncing", "talon-extending", "branch-blending",
        "mate-defrosting", "talon-grappling", "adult-acquiring", "sound-funneling",
        "feather-zipping",
        # 16 bytes
        "low-light-seeing", "threat-posturing", "walking-branches", "parent-following",
        "cleaning-stomach", "mouse-swallowing", "freezing-storage", "lifelong-pairing",
        "sun-bathing-rare", "vigilant-resting",
        # 17 bytes
        "head-rotating-270", "large-eye-staring", "courtship-calling", "intruder-fighting",
        # 18 bytes
        "hatching-staggered", "fur-bones-spitting", "plunge-diving-snow", "swallow-head-first",
        "body-warming-cache", "plumage-developing", "sleeping-eyes-half",
    ],
    "hawk": [
        # 6 bytes
        "kiting",
        # 7 bytes
        "soaring", "gliding", "calling",
        # 8 bytes
        "perching", "scanning", "mantling", "brooding",
        "hatching", "fledging", "ignoring", "preening",
        # 9 bytes
        "screaming",
        # 10 bytes
        "eye-fixing", "incubating",
        # 11 bytes
        "prey-tiring", "eggs-laying", "sun-bathing",
        # 12 bytes
        "prey-locking", "beak-tearing", "perch-eating", "branch-using",
        "mate-feeding", "mate-bonding", "bowl-shaping", "eyas-feeding",
        "beak-feeding", "eyas-growing", "first-flight", "food-begging",
        "mate-finding",
        # 13 bytes
        "agile-weaving", "prepping-prey", "nest-building", "hunt-learning",
        # 14 bytes
        "wing-spreading", "stoop-modified", "dive-attacking", "brush-bursting",
        "branch-dodging", "chase-extended", "mouse-tackling", "rabbit-killing",
        "snake-grabbing", "prey-shredding", "prey-shielding", "food-defending",
        "stick-stacking", "parent-calling", "perch-changing",
        # 15 bytes
        "accipiter-style", "talon-snatching", "midair-grabbing", "ground-pouncing",
        "prey-portioning",
        # 16 bytes
        "thermal-circling", "fence-post-using", "sparrow-catching", "starling-mobbing",
        "lizard-snatching", "courtship-aerial", "sky-dancing-some", "intruder-warning",
        "perch-relocating", "sleeping-perched", "eye-closing-half", "vigilant-resting",
        # 17 bytes
        "primaries-fanning", "songbird-pursuing", "plucking-feathers", "kill-caching-rare",
        "branching-walking", "dispersal-leaving", "mobbing-tolerated", "pursuit-launching",
        "songbird-flushing", "dust-bathing-rare",
        # 18 bytes
        "branch-overlooking", "telephoto-spotting", "surprise-launching", "persistence-flying",
        "juvenile-following", "eye-color-changing", "kee-eee-vocalizing", "surprise-attacking",
        "immediate-pursuing", "capture-or-abandon", "alternative-trying",
    ],
    "raccoon": [
        # 7 bytes
        "hissing", "purring", "chasing",
        # 8 bytes
        "dabbling", "climbing", "growling", "snarling",
        # 9 bytes
        "wrestling",
        # 10 bytes
        "lid-prying", "chittering",
        # 11 bytes
        "paw-feeling", "lid-lifting", "can-rolling", "cob-husking",
        "grub-eating", "kit-whining", "jar-opening", "fat-storing",
        # 12 bytes
        "hand-washing", "egg-stealing", "nest-raiding", "log-flipping",
        "bark-peeling", "kit-tumbling", "lone-roaming", "fork-resting",
        # 13 bytes
        "latch-opening", "trash-tipping", "food-stealing", "fruit-picking",
        "fish-catching", "frog-grabbing", "pond-checking", "chimney-using",
        "dusk-emerging", "mock-fighting", "latrine-using", "scent-marking",
        "tree-sleeping", "tail-wrapping", "group-denning",
        # 14 bytes
        "lock-defeating", "suet-snatching", "corn-stripping", "melon-cracking",
        "chick-grabbing", "branch-walking", "hollow-denning", "attic-invading",
        "urban-thriving", "mother-calling", "puzzle-solving", "curled-napping",
        # 15 bytes
        "garbage-raiding", "dumpster-diving", "kitchen-raiding", "beetle-snapping",
        "tree-scampering", "mask-displaying", "sibling-playing", "mother-teaching",
        "decision-making",
        # 16 bytes
        "crayfish-fishing", "suburban-raiding", "dawn-active-rare", "eyeshine-glowing",
        "food-introducing", "climbing-lessons", "swim-introducing", "scratching-trees",
        "doorknob-turning", "bottle-uncapping", "problem-tackling", "memory-retaining",
        # 17 bytes
        "pet-food-grabbing", "tadpole-snatching", "female-tolerating", "range-overlapping",
        "body-heat-sharing",
        # 18 bytes
        "dexterous-grasping", "nocturnal-prowling", "hunt-demonstrating", "clever-improvising",
        "weight-fluctuating",
    ],
    "badger": [
        # 6 bytes
        "eating",
        # 7 bytes
        "digging", "hissing", "killing", "ranging",
        "weaning",
        # 8 bytes
        "growling", "snarling",
        # 9 bytes
        "wrestling",
        # 10 bytes
        "clan-loyal",
        # 11 bytes
        "allomarking", "bulb-eating", "spring-cubs",
        # 12 bytes
        "root-digging", "path-walking", "gate-finding", "cub-emerging",
        "sett-curling", "group-piling", "fur-grooming", "allogrooming",
        # 13 bytes
        "tunnel-mining", "dirt-mounding", "leaf-bringing", "fur-bristling",
        "scent-marking", "latrine-using", "scent-bonding", "dawn-emerging",
        "dusk-foraging", "slug-grabbing", "mock-fighting", "mating-summer",
        "sleeping-deep", "claw-cleaning", "growl-warning",
        # 14 bytes
        "soil-shoveling", "sett-defending", "holding-fierce", "group-cohesion",
        "fruit-grabbing", "traffic-victim", "mother-nursing", "cub-protecting",
        "first-foraging", "dispersal-rare", "warmth-sharing", "alarm-snorting",
        # 15 bytes
        "sett-excavating", "communal-living", "family-grouping", "biting-savagely",
        "communal-toilet", "kin-recognizing", "belly-attacking", "sibling-playing",
        "sett-inheriting", "daytime-resting", "mutual-grooming",
        # 16 bytes
        "burrow-extending", "chamber-creating", "cleaning-bedding", "clan-cooperating",
        "juvenile-helping", "identity-marking", "nocturnal-active", "ground-snuffling",
        "beetle-snatching", "prickle-flipping", "generation-using", "hedge-traversing",
        # 17 bytes
        "intruder-fighting", "threat-displaying", "well-worn-pathing", "century-old-setts",
        "mother-tolerating", "parasite-removing", "family-vocalizing",
        # 18 bytes
        "earthworm-foraging", "omnivorous-flexing", "badger-trail-using", "cubs-birthing-sett",
        "winter-fertilizing", "snore-occasionally",
    ],
    "beaver": [
        # 7 bytes
        "gnawing",
        # 8 bytes
        "dragging", "flooding", "swimming",
        # 11 bytes
        "mud-packing", "kit-rearing", "leak-fixing", "ear-closing",
        "bark-eating", "dusk-active",
        # 12 bytes
        "tree-felling", "ring-cutting", "falling-tree", "water-towing",
        "kit-suckling", "dive-lessons", "mud-applying", "log-floating",
        "twig-chewing", "oil-glanding", "mate-seeking",
        # 13 bytes
        "wedge-cutting", "stick-weaving", "log-balancing", "pond-creating",
        "water-raising", "swim-teaching", "hole-plugging", "tail-slapping",
        "water-warning", "family-diving", "winter-larder", "mud-weighting",
        "scent-marking", "dam-defending", "family-piling", "dawn-emerging",
        # 14 bytes
        "bark-stripping", "trunk-circling", "lodge-building", "dam-patrolling",
        "branch-tamping", "winter-feeding", "family-marking", "lodge-sleeping",
        "warmth-sharing",
        # 15 bytes
        "keystone-acting", "family-dwelling", "alarm-signaling", "nostril-closing",
        "lily-pad-eating", "two-year-helper", "daytime-resting", "moonlit-felling",
        # 16 bytes
        "branch-stripping", "dam-constructing", "wetland-creating", "branch-anchoring",
        "slap-tail-rudder", "castor-secreting", "neighbor-warning", "juvenile-helping",
        # 17 bytes
        "incisor-chiseling", "habitat-modifying", "ecosystem-shaping", "predator-alerting",
        "escape-underwater", "fur-waterproofing", "intruder-fighting", "nocturnal-working",
        # 18 bytes
        "dry-chamber-living", "mud-floor-stamping", "nictating-membrane", "gnawing-underwater",
        "leaf-eating-summer", "territory-claiming", "family-cooperating", "kit-care-assisting",
        "dam-building-fresh",
    ],
    "moose": [
        # 6 bytes
        "mating",
        # 7 bytes
        "locking", "pushing", "rutting",
        # 8 bytes
        "browsing", "scarring", "swimming",
        # 9 bytes
        "surfacing", "bellowing", "listening",
        # 10 bytes
        "lying-down", "ruminating", "senescence",
        # 11 bytes
        "twig-eating", "lake-wading", "cow-calling", "lone-living",
        "dusk-active", "cud-chewing",
        # 12 bytes
        "salt-licking", "calf-licking", "wolf-fending", "hoof-kicking",
        "ear-rotating", "lake-cooling", "bedding-down",
        # 13 bytes
        "lily-grabbing", "bull-fighting", "bull-grunting", "calf-suckling",
        "lethal-strike", "bear-fighting", "mile-swimming", "dewlap-waving",
        "shade-seeking", "dawn-foraging", "tooth-wearing",
        # 14 bytes
        "aspen-nibbling", "holding-breath", "sodium-seeking", "antler-growing",
        "antler-rubbing", "calf-following", "holding-ground", "calf-defending",
        "river-crossing", "tick-suffering", "panting-summer", "heat-suffering",
        "midday-resting",
        # 15 bytes
        "pond-submerging", "mineral-craving", "velvet-shedding", "antler-clashing",
        "weaker-yielding", "wallow-creating", "scent-spreading", "attracting-cows",
        "calf-protecting", "deep-snow-using", "lake-traversing", "bell-displaying",
        "exhaustion-rare",
        # 16 bytes
        "willow-stripping", "solitary-roaming", "cow-calf-pairing", "predator-evading",
        "current-handling", "winter-tick-load", "regrowing-spring", "generation-aging",
        # 17 bytes
        "neck-deep-feeding", "road-salt-finding", "sapling-thrashing", "dominance-showing",
        "urine-pit-digging", "cow-investigating", "twin-occasionally", "riparian-favoring",
        "beaver-pond-using",
        # 18 bytes
        "birch-bark-tasting", "palmate-displaying", "defensive-charging", "snow-melting-shape",
        "scratch-tree-using", "calf-vulnerability", "lifetime-territory",
    ],
    "bison": [
        # 6 bytes
        "mating", "pawing",
        # 7 bytes
        "grazing", "rutting", "tending",
        # 8 bytes
        "scarring", "snorting", "grunting",
        # 9 bytes
        "wallowing", "bellowing", "gestating", "listening",
        # 11 bytes
        "herd-moving", "mud-coating", "calf-center", "range-using",
        # 12 bytes
        "dust-bathing", "dirt-rolling", "snow-plowing", "head-butting",
        "dust-tossing", "cow-courting", "red-dog-calf", "calf-licking",
        "wolf-fending", "mob-charging", "tree-rubbing", "post-rubbing",
        "herd-resting", "head-lifting", "ear-rotating", "wind-tasting",
        "calm-grazing", "mass-running", "head-shaking", "mane-shaking",
        "fly-swatting",
        # 13 bytes
        "fly-deterring", "head-swinging", "snow-clearing", "cold-enduring",
        "bull-fighting", "horn-clashing", "ground-pawing", "calf-suckling",
        "calf-creching", "route-knowing", "water-finding", "sacred-status",
        "tail-flicking",
        # 14 bytes
        "grass-cropping", "sun-protecting", "weaker-running", "urine-spraying",
        "calf-following", "bull-periphery", "sleeping-lying", "alert-standing",
        "scent-checking",
        # 15 bytes
        "winter-foraging", "blizzard-facing", "head-into-storm", "herd-protecting",
        "scratch-rubbing", "herd-rebuilding", "grass-promoting", "sentinel-acting",
        # 16 bytes
        "plain-traversing", "grass-uncovering", "wallow-deepening", "defensive-circle",
        "alarm-vocalizing", "pasture-rotating", "generation-using", "fence-destroying",
        "prairie-keystone", "hunter-pressured",
        # 17 bytes
        "head-down-feeding", "parasite-removing", "herd-coordinating", "matriarch-leading",
        "prairie-restoring", "sleeping-standing", "vigilant-rotating", "sudden-stampeding",
        # 18 bytes
        "migration-historic", "opposite-of-cattle", "predator-defending", "depression-marking",
    ],
    "lynx": [
        # 7 bytes
        "leaping",
        # 8 bytes
        "stalking", "pouncing", "climbing",
        # 9 bytes
        "ambushing", "gestating",
        # 11 bytes
        "neck-biting", "eye-glowing", "dusk-active", "day-resting",
        "log-bedding", "fat-burning",
        # 12 bytes
        "log-perching", "cold-storage", "dawn-hunting", "mate-calling",
        "mating-brief", "lone-roaming",
        # 13 bytes
        "snow-stepping", "hare-pursuing", "low-crouching", "snow-bursting",
        "prey-tackling", "kill-dragging", "cache-burying", "snow-covering",
        "cold-enduring", "eerie-screams", "male-tracking", "mock-pouncing",
        "scent-marking", "scrape-making", "tree-escaping",
        # 14 bytes
        "prey-detecting", "log-pile-using", "kitten-nursing", "urine-spraying",
        "exclusive-male", "water-avoiding", "river-crossing", "range-shifting",
        # 15 bytes
        "prey-revisiting", "alert-listening", "paw-fur-padding", "silent-stalking",
        "ruff-displaying", "kitten-teaching", "sibling-playing", "tree-scratching",
        "range-defending", "intruder-rarely", "branch-perching", "grouse-grabbing",
        # 16 bytes
        "big-paw-floating", "snowshoe-walking", "sound-amplifying", "low-light-seeing",
        "snow-print-large", "female-following", "mother-defending", "charging-threats",
        "hunt-introducing", "neighbor-warning",
        # 17 bytes
        "boom-bust-cycling", "kitten-protecting", "female-tolerating",
        # 18 bytes
        "nocturnal-prowling", "brush-pile-curling", "snow-shelter-using", "black-tip-flagging",
        "hare-prey-bringing", "squirrel-snatching", "weight-fluctuating", "climate-vulnerable",
    ],
    "jaguar": [
        # 6 bytes
        "mating",
        # 7 bytes
        "calling",
        # 8 bytes
        "swimming", "scarring",
        # 9 bytes
        "gestating", "den-using", "listening", "satiating",
        # 10 bytes
        "cub-hiding",
        # 11 bytes
        "mud-rolling", "hollow-tree", "cub-nursing", "dawn-active",
        "log-bedding", "paw-licking",
        # 12 bytes
        "tree-marking", "scat-leaving", "roaring-deep", "cub-birthing",
        "cub-teaching", "dusk-hunting", "fur-grooming", "face-washing",
        "ear-rotating",
        # 13 bytes
        "fish-catching", "deer-stalking", "tree-climbing", "drop-pouncing",
        "cache-hanging", "river-cooling", "scent-marking", "dense-thicket",
        "fish-locating",
        # 14 bytes
        "river-crossing", "shell-cracking", "skull-piercing", "brain-piercing",
        "urine-spraying", "cub-protecting", "branch-leaping", "kill-immediate",
        # 15 bytes
        "jungle-prowling", "turtle-flipping", "monkey-pouncing", "branch-perching",
        "snake-attacking", "kill-protecting", "claw-sharpening", "brief-courtship",
        "large-territory", "range-defending", "water-explosion",
        # 16 bytes
        "current-handling", "caiman-attacking", "peccary-pursuing", "ambush-elevating",
        "fierce-mothering", "charging-threats", "solitary-roaming", "fight-displaying",
        "light-conditions", "ambush-launching", "drag-bank-eating",
        # 17 bytes
        "capybara-tackling", "drag-prey-up-tree", "scavenger-evading", "sawing-vocalizing",
        "mate-finding-call", "descent-headfirst", "ground-preference", "day-shade-resting",
        # 18 bytes
        "rosette-displaying", "riverbank-stalking", "water-edge-hunting", "surprise-attacking",
        "scratch-displaying", "hunt-demonstrating",
    ],
    "leopard": [
        # 6 bytes
        "sawing",
        # 7 bytes
        "lifting", "weaning",
        # 8 bytes
        "stalking", "pouncing",
        # 9 bytes
        "ambushing", "gestating", "den-using",
        # 10 bytes
        "descending", "cub-hiding",
        # 11 bytes
        "neck-biting", "cub-nursing", "cub-licking", "dawn-active",
        "varied-prey", "fish-rarely", "paw-licking",
        # 12 bytes
        "low-crawling", "tree-hauling", "claw-marking", "rasping-call",
        "mating-brief", "cub-birthing", "dusk-hunting", "fur-grooming",
        # 13 bytes
        "prey-dragging", "kill-stashing", "hyena-evading", "lion-avoiding",
        "scent-marking", "rocky-crevice", "dense-thicket", "hyena-fending",
        "hunt-learning", "sleeping-fork", "day-bed-using", "dog-snatching",
        "body-cleaning",
        # 14 bytes
        "brush-blending", "branch-caching", "cache-claiming", "urine-spraying",
        "neighbor-vocal", "male-detecting", "cub-protecting", "reptile-eating",
        "drinking-quick", "alert-vigilant",
        # 15 bytes
        "conflict-rising", "tree-scratching", "mother-teaching", "solitary-living",
        "climb-confident", "branch-perching", "baboon-grabbing", "hyrax-snatching",
        # 16 bytes
        "range-patrolling", "infanticide-risk", "prey-introducing", "climbing-lessons",
        "dawn-prey-active",
        # 17 bytes
        "mother-relocating", "conflict-avoiding", "antelope-stalking", "bird-occasionally",
        # 18 bytes
        "climbing-with-prey", "territory-claiming", "cub-mouth-carrying", "juvenile-following",
        "range-establishing", "white-leopard-rare",
    ],
    "gorilla": [
        # 7 bytes
        "chasing", "hooting",
        # 8 bytes
        "tickling", "grunting", "learning", "geophagy",
        "swim-not",
        # 9 bytes
        "wrestling", "observing", "imitating",
        # 11 bytes
        "leaf-eating", "ground-nest", "scream-rare",
        # 12 bytes
        "stem-pulling", "hand-feeding", "dawn-feeding", "dusk-nesting",
        "log-bridging",
        # 13 bytes
        "chest-beating", "charging-mock", "banana-eating", "food-carrying",
        "mock-fighting", "alarm-barking", "slowly-moving", "branch-bridge",
        "cross-shallow",
        # 14 bytes
        "bark-stripping", "fruit-grabbing", "careful-eating", "leaves-bending",
        "midday-resting", "social-bonding", "group-cohesion", "jungle-roaming",
        # 15 bytes
        "knuckle-walking", "nettle-handling", "mother-cradling", "infant-clinging",
        "mother-carrying", "gentle-handling", "problem-solving", "tool-using-rare",
        "multi-male-rare",
        # 16 bytes
        "group-protecting", "family-defending", "juvenile-playing", "sibling-tussling",
        "predator-warning", "alliance-forming", "careful-touching", "alpha-protecting",
        # 17 bytes
        "ground-locomoting", "threat-displaying", "tree-resting-rare", "ground-preferring",
        "foraging-together", "grooming-mutually", "dust-bathing-rare", "altitude-handling",
        # 18 bytes
        "silverback-leading", "charging-real-rare", "climbing-juveniles", "branches-arranging",
        "infant-co-sleeping", "infant-back-riding", "group-coordinating", "infant-fascinating",
        "generation-knowing", "eco-zone-utilizing", "conservation-icons",
    ],
    "chimpanzee": [
        # 7 bytes
        "hooting", "kissing",
        # 8 bytes
        "climbing", "stomping",
        # 9 bytes
        "embracing", "gestating",
        # 11 bytes
        "ant-dipping", "infanticide", "lice-eating", "hiding-food",
        # 12 bytes
        "tree-leaping", "fig-grabbing", "nut-cracking", "hammer-stone",
        "pant-hooting", "patrol-group", "hand-holding", "dawn-feeding",
        "dusk-nesting",
        # 13 bytes
        "bipedal-brief", "taste-testing", "water-sopping", "drinking-leaf",
        "alpha-fooling", "mate-stealing", "sneaky-mating", "lone-birthing",
        "allomothering", "tree-sleeping",
        # 14 bytes
        "fruit-foraging", "ripe-selecting", "tool-improving", "prey-cornering",
        "chorus-calling", "border-walking", "peace-grooming", "reconciliation",
        "social-bonding",
        # 15 bytes
        "knuckle-walking", "branch-swinging", "termite-fishing", "capture-sharing",
        "branch-dragging", "mutual-grooming", "infant-cradling", "play-tolerating",
        "mother-teaching", "problem-solving", "planning-future", "deception-using",
        "mating-multiple", "infant-birthing", "return-to-group", "sibling-helping",
        "sibling-rivalry", "complex-society",
        # 16 bytes
        "brachiating-some", "stick-tool-using", "hunters-strategy", "allies-rewarding",
        "charging-display", "group-vocalizing", "cannibalism-rare", "parasite-picking",
        "tool-instruction", "weaning-extended", "tool-stockpiling", "false-vocalizing",
        "philopatric-male",
        # 17 bytes
        "leaf-sponge-using", "juvenile-watching", "meat-distributing", "alpha-controlling",
        "coalition-forming", "lethal-aggression", "war-like-behavior", "infant-tolerating",
        "juvenile-allowing", "female-presenting", "mother-protecting", "leaf-bed-building",
        # 18 bytes
        "group-coordinating", "alliance-cementing", "learning-prolonged", "infant-introducing",
    ],
    "orangutan": [
        # 6 bytes
        "mating",
        # 7 bytes
        "calling",
        # 8 bytes
        "scarring",
        # 9 bytes
        "long-call", "gestating",
        # 10 bytes
        "tool-using", "bimaturism",
        # 11 bytes
        "brachiating", "ground-rare", "far-roaming", "lone-living",
        # 12 bytes
        "fig-grabbing", "far-foraging", "male-warning", "leaf-shelter",
        # 13 bytes
        "slow-climbing", "durian-eating", "fruit-mapping", "semi-solitary",
        "leaf-umbrella", "canopy-living", "female-choice", "single-infant",
        # 14 bytes
        "branch-testing", "fruit-foraging", "route-planning", "8-year-weaning",
        "intensive-care", "daytime-active",
        # 15 bytes
        "sway-tree-using", "lychee-favoring", "solitary-mostly", "jungle-dwelling",
        "infant-clinging", "mother-carrying",
        # 17 bytes
        "seasonal-tracking", "7-year-dependence", "learning-extended", "bornean-different",
        "female-attracting", "mother-tolerating", "juvenile-watching", "dominance-pyrrhic",
        "gentle-considered", "parasite-managing",
        # 18 bytes
        "tree-bridge-method", "suspension-feeding", "cultural-variation", "balance-developing",
        "occasional-meeting", "mirror-recognizing", "dawn-emerging-nest", "dusk-nest-building",
        "tree-fork-favoring",
    ],
    "sloth": [
        # 7 bytes
        "hanging",
        # 8 bytes
        "locating",
        # 9 bytes
        "gestating",
        # 10 bytes
        "bury-feces", "climb-back", "slow-reach",
        # 11 bytes
        "slow-moving", "leaf-eating", "biting-rare", "mating-tree",
        "270-degrees", "sun-warming",
        # 12 bytes
        "claw-hooking", "head-tucking", "male-roaming", "mating-brief",
        "male-hearing", "descent-rare", "leaf-pulling", "slow-chewing",
        "fermentation",
        # 13 bytes
        "climb-back-up", "slow-blinking", "rain-enduring", "baby-clinging",
        "single-infant", "neck-rotating", "careful-grasp", "shade-cooling",
        # 14 bytes
        "mortality-risk", "moth-harboring", "water-shedding", "jaguar-fearing",
        "river-crossing", "15-hours-daily", "branch-curling", "careful-pacing",
        "slow-digesting",
        # 15 bytes
        "slow-metabolism", "rare-defecating", "exhausting-trip", "symbiotic-algae",
        "infant-on-belly", "mother-carrying", "branch-spotting", "microbe-helping",
        # 16 bytes
        "two-toe-grasping", "green-camouflage", "careful-watching", "current-handling",
        "nostrils-closing", "eye-half-closing", "slow-development", "juvenile-staying",
        "scream-mate-call", "hoffmann-species", "linnaeus-species",
        # 17 bytes
        "branch-suspending", "algae-growing-fur", "ecosystem-on-back", "defensive-clawing",
        "sleeping-extended", "mother-tolerating", "vocalizing-rarely", "energy-conserving",
        # 18 bytes
        "three-toe-clinging", "upside-down-living", "predator-detecting", "female-philopatric",
        "two-toed-different",
    ],
    "armadillo": [
        # 7 bytes
        "digging",
        # 8 bytes
        "sniffing",
        # 9 bytes
        "gestating", "belly-fur",
        # 10 bytes
        "ant-eating", "fruit-rare", "21-species", "scaly-skin",
        # 11 bytes
        "worm-eating", "gulping-air", "dawn-active", "hair-sparse",
        # 12 bytes
        "ball-curling", "polyembryony", "rabbit-using", "head-tucking",
        # 13 bytes
        "dirt-flinging", "snout-rooting", "grub-grabbing", "larva-pulling",
        "vertical-jump", "dusk-foraging",
        # 14 bytes
        "claw-shoveling", "sphere-perfect", "road-mortality", "river-crossing",
        "model-organism", "mother-nursing", "texas-resident", "soft-underside",
        "others-bracing",
        # 15 bytes
        "insect-foraging", "termite-licking", "beetle-snapping", "spider-grabbing",
        "tongue-flicking", "complex-burrows", "eco-engineering", "snake-occupying",
        "cold-vulnerable", "range-spreading", "species-diverse", "partial-defense",
        # 16 bytes
        "ground-snuffling", "plant-occasional", "armor-displaying", "leaping-startled",
        "soft-shell-young", "solitary-typical",
        # 17 bytes
        "burrow-excavating", "surprising-height", "head-bumping-cars", "lethal-misfortune",
        "hardening-gradual", "foraging-learning", "abandoned-burrows",
        # 18 bytes
        "omnivorous-flexing", "jaguar-frustrating", "juvenile-following", "dispersal-eventual",
        "range-establishing",
    ],
    "anteater": [
        # 8 bytes
        "no-teeth", "slashing",
        # 9 bytes
        "moving-on", "gestating",
        # 10 bytes
        "no-chewing", "fur-warmth", "alarm-rare",
        # 11 bytes
        "ant-licking", "dawn-active",
        # 12 bytes
        "mass-feeding", "claw-ripping", "slow-walking", "year-of-care",
        "mating-brief",
        # 13 bytes
        "sticky-saliva", "rapid-licking", "climbing-some", "lone-birthing",
        "wetland-using", "pampas-living", "dusk-foraging",
        # 14 bytes
        "mound-cracking", "sustainability", "sleep-extended", "15-hours-daily",
        "weaning-slowly", "nocturnal-some",
        # 15 bytes
        "two-foot-tongue", "never-depleting", "snout-elongated", "jaw-tube-shaped",
        "jaguar-injuring", "slow-metabolism", "mother-carrying", "vocalizing-rare",
        "infant-clinging", "water-tolerance", "llanos-haunting",
        # 16 bytes
        "tongue-extending", "termite-grabbing", "careful-foraging", "walking-on-fists",
        "claws-displaying", "bear-hug-defense", "otherwise-gentle", "fierce-defending",
        "solitary-roaming", "termite-locating", "regional-pattern",
        # 17 bytes
        "defensive-rearing", "bipedal-defensive", "predator-injuring", "energy-conserving",
        "mother-protecting", "snorting-grunting",
        # 18 bytes
        "powerful-foreclaws", "balance-tail-using", "deep-wound-capable", "infant-back-riding",
        "range-establishing", "growling-defensive", "daytime-some-silky",
    ],
    "hedgehog": [
        # 7 bytes
        "denning", "hissing",
        # 8 bytes
        "grunting",
        # 9 bytes
        "snuffling", "anointing", "gestating", "eye-small",
        # 10 bytes
        "vocalizing",
        # 11 bytes
        "slug-eating", "dusk-active", "hibernating", "fat-burning",
        "lean-hungry", "vision-poor", "smell-acute",
        # 12 bytes
        "dog-puzzling", "body-cooling", "hibernaculum", "male-roaming",
        "hearing-good",
        # 13 bytes
        "spine-defense", "insect-eating", "worm-grabbing", "spine-coating",
        "winter-torpor", "heart-slowing", "mating-spring",
        # 14 bytes
        "quill-erecting", "perfect-sphere", "snail-cracking", "self-anointing",
        "foaming-saliva", "hedgerow-using", "urban-thriving", "hours-circling",
        "mating-careful", "mother-nursing", "snuffling-loud",
        # 15 bytes
        "rolling-up-ball", "fox-frustrating", "ground-foraging", "beetle-snapping",
        "egg-eating-rare", "possible-mating", "garden-prowling", "trail-following",
        "weight-doubling", "leaf-pile-using", "spring-emerging", "hoglet-birthing",
        "snout-sensitive", "whisker-feeling", "gardener-friend",
        # 16 bytes
        "adder-resistance", "possible-defense", "log-pile-curling", "refeeding-urgent",
        "spine-flattening", "fierce-defending", "leave-alone-rule", "solitary-typical",
        "chuckling-mating", "alarm-vocalizing",
        # 17 bytes
        "frog-occasionally", "suburban-foraging", "mortality-traffic", "hardening-gradual",
        "hoglet-protecting", "juvenile-emerging", "foraging-learning",
        # 18 bytes
        "muscle-contracting", "omnivorous-flexing", "dawn-emerging-rare", "hyperphagia-autumn",
        "courtship-circling", "dispersal-eventual", "range-establishing", "scent-marking-anal",
        "screaming-distress", "road-fragmentation",
    ],
    "porcupine": [
        # 7 bytes
        "denning", "whining", "moaning",
        # 8 bytes
        "flipping", "climbing", "grunting",
        # 9 bytes
        "embedding", "gestating",
        # 10 bytes
        "vocalizing",
        # 11 bytes
        "hollow-tree", "log-curling", "bark-winter",
        # 12 bytes
        "tail-shaking", "tree-feeding", "salt-craving", "bone-chewing",
        "slow-walking",
        # 13 bytes
        "gait-waddling", "rocky-crevice", "scent-marking", "weaning-quick",
        "dusk-foraging", "nibbling-buds",
        # 14 bytes
        "quill-rattling", "spine-erecting", "myth-debunking", "barb-detaching",
        "soft-underside", "killing-method", "bark-stripping", "cambium-eating",
        "plywood-eating", "antler-gnawing", "log-pile-using", "winter-shelter",
        "urine-spraying", "mother-nursing", "family-diverse", "twig-stripping",
        # 15 bytes
        "warning-display", "belly-attacking", "branch-perching", "calcium-seeking",
        "climbing-clumsy", "fall-occasional", "dispersal-early", "daytime-resting",
        # 16 bytes
        "contact-required", "ground-shuffling", "solitary-typical", "juvenile-roaming",
        "learning-defense", "dawn-active-some", "branch-balancing", "fat-storing-fall",
        # 17 bytes
        "infection-causing", "tool-shed-raiding", "soft-quills-birth", "hardening-quickly",
        "herbaceous-summer", "seasonal-shifting",
        # 18 bytes
        "predator-suffering", "axe-handle-gnawing", "sweat-salt-licking", "mineral-deficiency",
        "range-establishing", "mating-call-female", "new-world-arboreal", "tree-fork-sleeping",
    ],
}


# -----------------------------------------------------------------------------
# Packer
# -----------------------------------------------------------------------------

def array_byte_length(verbs: list[str]) -> int:
    """Bytes of `["v1","v2",...,"vN"]` when written as ASCII JSON."""
    if not verbs:
        return 2
    return 2 + 2 * len(verbs) + (len(verbs) - 1) + sum(len(v.encode("utf-8")) for v in verbs)


def pack_to_target(target_bytes: int, pool: list[str], seed: int) -> list[str]:
    """Find a random verb list whose JSON-array form is exactly target_bytes."""
    rng = random.Random(seed)
    by_len: dict[int, list[str]] = {}
    for v in pool:
        by_len.setdefault(len(v.encode("utf-8")), []).append(v)
    pool_lens = sorted(by_len)
    min_len, max_len = pool_lens[0], pool_lens[-1]

    # array_bytes(N) = 3*N + 1 + sum(content_lens)
    # so for fixed N: content_target = target_bytes - 3*N - 1
    min_N = max(1, (target_bytes - 1) // (max_len + 3))
    max_N = max(min_N, (target_bytes - 1) // (min_len + 3) + 1)
    candidate_Ns = list(range(min_N, max_N + 1))
    rng.shuffle(candidate_Ns)

    for N in candidate_Ns:
        content_target = target_bytes - 3 * N - 1
        if content_target < N * min_len or content_target > N * max_len:
            continue
        for _ in range(3000):
            picks: list[str] = []
            remaining = content_target
            ok = True
            for i in range(N):
                slots_left = N - i - 1
                if slots_left == 0:
                    if remaining in by_len:
                        picks.append(rng.choice(by_len[remaining]))
                        break
                    ok = False
                    break
                lo = max(min_len, remaining - slots_left * max_len)
                hi = min(max_len, remaining - slots_left * min_len)
                if lo > hi:
                    ok = False
                    break
                # Pick any pool length in [lo, hi]
                options = [L for L in pool_lens if lo <= L <= hi]
                if not options:
                    ok = False
                    break
                L = rng.choice(options)
                picks.append(rng.choice(by_len[L]))
                remaining -= L
            if ok and len(picks) == N and array_byte_length(picks) == target_bytes:
                return picks

    raise RuntimeError(
        f"Cannot pack target={target_bytes}B from pool of {len(pool)} "
        f"(lengths {pool_lens})"
    )


# -----------------------------------------------------------------------------
# Binary scan / patch
# -----------------------------------------------------------------------------

# The Bun-bundled JS assigns the verb pool inside an IIFE init block. The
# minified variable name differs between builds (macOS uses `$38`, Linux uses
# `_56`), but the surrounding shape is stable across both:
#     =>{<init>();<var>=["<v1>","<v2>",...,"<vN>"]
# Anchoring on this pattern works pre- and post-patch (we don't depend on any
# specific verb being present), so the patcher remains idempotent.
ARRAY_RE = re.compile(rb'=>\{[\w$]+\(\);[\w$]+=\[("[^"]+",){50,}"[^"]+"\]')


# Distinctive verbs from the original Claude Code pool — used to identify
# the verb-pool array on a pristine binary. Any one of these inside an array
# match is a near-certain positive ID.
ORIGINAL_VERB_SENTINELS = [
    b"Pouncing", b"Frolicking", b"Schlepping", b"Bloviating",
    b"Boondoggling", b"Discombobulating", b"Flibbertigibbeting",
    b"Hullaballooing", b"Razzmatazzing", b"Lollygagging",
    b"Whatchamacalliting", b"Cogitating", b"Tomfoolering",
]


def is_verb_pool_array(content: bytes) -> bool:
    """True if `content` (an array literal) is the Claude Code verb pool —
    either pristine (contains an original verb) or already patched by us
    (contains a verb from any registered animal pool)."""
    if any(s in content for s in ORIGINAL_VERB_SENTINELS):
        return True
    for pool in POOLS.values():
        for v in pool:
            if (b'"' + v.encode("ascii") + b'"') in content:
                return True
    return False


def find_arrays(data: bytes) -> list[tuple[int, int]]:
    """Return [(start, end_exclusive), ...] of verb-pool array literals."""
    found = []
    for m in ARRAY_RE.finditer(data):
        eq = data.find(b"[", m.start())
        if eq < 0:
            continue
        end = m.end()
        if is_verb_pool_array(data[eq:end]):
            found.append((eq, end))
    seen = set()
    uniq = []
    for a, b in found:
        if (a, b) not in seen:
            seen.add((a, b))
            uniq.append((a, b))
    return uniq


def codesign_adhoc(path: Path) -> None:
    """On macOS, replace the Apple Developer signature with an ad-hoc one so
    the hardened-runtime page-hash check accepts our edits. No-op elsewhere
    (Linux ELFs don't carry signatures by default)."""
    if sys.platform != "darwin":
        return
    subprocess.run(
        ["codesign", "--force", "--sign", "-", "--preserve-metadata=entitlements,flags", str(path)],
        check=True,
        capture_output=True,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--binary", default=os.path.expanduser("~/.local/bin/claude"))
    ap.add_argument("--pool", default="duck", choices=list(POOLS))
    ap.add_argument("--seed", type=int, default=None,
                    help="RNG seed (default: random per run)")
    ap.add_argument("--restore", action="store_true",
                    help="Restore from <binary>.orig backup and exit")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    bin_path = Path(args.binary)
    if bin_path.is_symlink():
        bin_path = bin_path.resolve()
    if not bin_path.exists():
        print(f"Binary not found: {bin_path}", file=sys.stderr)
        return 1
    backup_path = bin_path.with_name(bin_path.name + ".orig")

    if args.restore:
        if not backup_path.exists():
            print(f"No backup at {backup_path}", file=sys.stderr)
            return 1
        shutil.copy2(backup_path, bin_path)
        codesign_adhoc(bin_path)  # re-sign restored copy
        print(f"Restored {bin_path} from {backup_path} and re-signed.")
        return 0

    print(f"Binary: {bin_path}  ({bin_path.stat().st_size:,} bytes)")
    data = bin_path.read_bytes()
    arrays = find_arrays(data)
    if len(arrays) < 2:
        print(f"Expected ≥2 verb arrays, found {len(arrays)}", file=sys.stderr)
        for a, b in arrays:
            print(f"  [{a:#x}..{b:#x}]  {b - a}B  preview={data[a:a+60]!r}",
                  file=sys.stderr)
        return 1

    # Verify all matches are the same byte count and identical content.
    sizes = {b - a for a, b in arrays}
    contents = {data[a:b] for a, b in arrays}
    if len(sizes) != 1 or len(contents) != 1:
        print(f"Mismatched arrays: sizes={sizes} unique_contents={len(contents)}",
              file=sys.stderr)
        return 1
    target_bytes = sizes.pop()
    print(f"Found {len(arrays)} verb arrays, each {target_bytes} bytes:")
    for a, b in arrays:
        print(f"  [{a:#x}..{b:#x}]")

    pool = POOLS[args.pool]
    seed = args.seed if args.seed is not None else int.from_bytes(os.urandom(4), "big")
    print(f"Pool: {args.pool} ({len(pool)} verbs), seed={seed}")
    new_verbs = pack_to_target(target_bytes, pool, seed)
    new_arr = ('["' + '","'.join(new_verbs) + '"]').encode("ascii")
    assert len(new_arr) == target_bytes, f"size mismatch: {len(new_arr)} vs {target_bytes}"

    print(f"Picked {len(new_verbs)} verbs (sample: {new_verbs[:6]} ... {new_verbs[-3:]})")

    if args.dry_run:
        print("Dry run — not writing.")
        return 0

    if not backup_path.exists():
        shutil.copy2(bin_path, backup_path)
        print(f"Backup: {backup_path}")

    new_data = bytearray(data)
    for a, b in arrays:
        new_data[a:b] = new_arr
    tmp_path = bin_path.with_suffix(bin_path.suffix + ".tmp")
    tmp_path.write_bytes(bytes(new_data))
    os.chmod(tmp_path, bin_path.stat().st_mode)
    os.replace(tmp_path, bin_path)
    print(f"Wrote {len(new_data):,} bytes to {bin_path}")

    print("Re-signing (ad-hoc)...")
    codesign_adhoc(bin_path)
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

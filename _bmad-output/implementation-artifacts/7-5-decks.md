# SHIP/INTEL UPGRADES:

HULL I, II, III, IV (copies 4), [ increases ship maximum and current HP ]
+ 25 HP each

SPEED I, II, III, IV (copies 4), [ increases ship top speed by this amount ]
+ 2.5 knots

INTEL I, II, III, IV, V (copies 5), [ increases radar sweep ]
+ 3 RPM

~~RANGE I, II, III, IV (copies 4), [ increases intel range and all things derived from this ]~~
~~+ 50 units to intel range~~
> DELETED cycle 119 (0.17.119), 2026-08-20, Eric ruling: "remove the intel range
> upgrade cards from the game." Base intel range does NOT compensate (holds at
> 660u) and the INTEL category survives on INTEL I-V alone. This was the only
> card that wrote radarRange, so the eighths ladder is now fixed at base for
> every player. Full record: epic-7-context-amendments.md Amendment 31.

RELOAD I, II, III, IV, V (copies 5), [ reduces cooldown time ]
+ 10%

# GUN UPGRADES:
The gun is absurdly powerful and does not need damage bonuses.

BARREL I, II (copies 2), [ adds a barrel, fires +1 bullet at once just as current upgrade does, except the shots should fire in parallel lines, not spreading ] 

EXTRA TURRET (copies 1), [ adds a turret, allowing the ship to stockpile up to two shots. this works exactly as the current upgrade does ]

# TORPEDO UPGRADES:

TORPEDO I, II, III, IV (copies 4) [ raises torpedo travel speed from 60 to 80 ]
+ 5 knots speed

EXTRA TUBE (copies 1), [ adds a second torpedo tube, works just as current upgrade does ]

ACOUSTIC HOMING (copies 1), [ works as current acoustic homing upgrade works ]

# SPEED BOOST UPGRADES

BOOST DURATION I, II, III, IV
+1 second boost duration

BOOST SPEED I, II
+ 5 Knots each

# STAR SHELLS
Star shells get a fundamental change... you are allowed to fire your gun into the region illuminated by star shells, even if it is outside of your maximum range.

STAR SHELLS I, II, III, IV
+ 1.25 second duration

PHOSPHOR SHELLS [ burning shells, works as before, except it is an added verb and not exclusive with DAZZLE ]

DAZZLE SHELLS [ dazzle shells, works as before, except it is not exclusive with the phosphor/burning shells ]

# MINE UPGRADES

MINES I, II, III, IV [ increases blast, trigger radius ]
+ 10% blast/trigger radius

PROP FOULING MINES [ no damage/stat reduction, simply slows affected ships by 25% for 5 seconds, is no longer an exclusive upgrade, otherwise works as before ]

CAPTIVE MINES [ new! this replaces the old tracking mines with a more realistic torpedo mine. trigger radius and blast radius switch values, then trigger radius is tripled . contains a single, un-upgraded torpedo, that does the Mine's damage and has the Mine's blast radius. Torpedo fires at the first hostile ship to come into range, intelligently leading the shot (though it can still be dodged). once fired, mine is expended. This VERY FUNDAMENTALLY makes the mines a different weapon. ]

# BUOY UPGRADES
Decoy Buoy is being completely reworked into the RADAR BUOY (Buoy).
Buoy contains its own radar with a range of 330 units. It has its own sweep that begins at 15 RPM, and relays its data to the player who controls the buoy. It has a 30 second duration. It additionally has 50 HP, and will be destroyed if it takes enough damage to reduce it to 0. The icon needs to be distinguished from the mines a bit more. Buoy should show up on radar, but not as a ship, it needs its own profile.

BUOY I, II, III, IV [ increases the buoy's sweep speed ]
+ 1.25 RPM

GUN BUOY [ gives the buoy a gun that deals 5 damage on a 5s cooldown. it fires at hostile ships in range. ]

JAMMING BUOY [ the buoy creates false returns in other ships' scans of the area covered by the buoy's range. enough false returns to obscure whatever is actually in that area. ]

# BROADSIDE BARRAGE
This is a new weapon that replaces the cannon. This will use the old side firing arcs that were in one of the older versions of the game, if you still have reference to those at all. You can aim at a point to either side, it will fire a barrage from that side of the ship out of all broadside turrets. One shell will *absolutely* hit at the target point, the rest fan out from there in a wide spread, ending their run at the same range as the target point. Each shell should deal, lets say 20 damage to anything it hits. Lets set the cooldown to 30 seconds. Begins with 3 broadside turrets. This weapon's range is limited to 5/8.

BROADSIDE SPREAD I, II, III, IV [ reduces the spread width so that broadside shots land closer together. i don't know what scale to set these to yet, we'll need to tweak, but they should basically go from spread, to parallel-ish, to nearish to the targeted location. in any case, you definitely can't hit a single ship with all the shots from this unless they are close and exposing their broadside to you. ]

BROADSIDE TURRETS I, II [ adds an extra turret, so 4 shots will fire per barrage, then 5. when there are 4 turrets specifically, there is no "middle turret that will absolutely hit the target location, so the two center shots will land on either side. once it is up to 5 turrets, then the middle shot will go to the clicked point. ]
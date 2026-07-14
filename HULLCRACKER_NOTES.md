# HULLCRACKER NOTES
This document will be my holding place for things. What things, you ask? Essentially, my own general ideas of how I think things should be, or what I think needs to happen.

## CLEAN CODEBASE
Clean codebase is important. I *hate* hardcoded things, and I *hate* repetition.

## SHIP CLASSES
We just have the one for now, but your ship as a player should be configurable to some degree. I don't know if this means preconfigured ship classes with different size/weapon loadouts, or the ability to customize your ship to some extent before the match, but either way ships need a standard form.

Ship Size:
Small ships move faster but are less durable.
Large ships move slower but are more durable
Medium ships sit in the middle.

## WEAPONS
Weapons also need to be standardized.
ONE SHOT PER CLICK.
Also, different classes of weapon should behave differently:
- Guns should fire at the mouse location when it is clicked. The shell does not proceed any further than that, but it can be stopped by the edge of the map, an island, or a ship prior to that.
- Torpedos should fire in the direction of the mouse when it is clicked. The only thing that stops a torpedo is edge of the map, an island, or another ship.
- Mines just drop. They aren't invisible, players should be able to see them. They also should have a duration, so they disappear automatically if not triggered after some time that is long enough to meaningfully feel like placing it matters. but not too long that they sit there forever until the map closes in on it. Either that or a player gets a maximum number of mines that can be out at once, and dropping more than that clears the oldest.

## UPGRADES!!!!!!!!!
This is my best idea yet I think.
To start, *ALL* ships will simply be one of the three classes:
- Destroyer (Smaller, faster ship, lets say 60 speed and 40 hull)
- Cruiser (Medium, average ship, lets say 50 speed and 50 hull)
- Battleship (Larger, slower ship, lets say 40 speed and 60 hull)
You pick the one you want before queueing.

All ships have the same loadouts.
- Fore torpedo tube
- Broadside gun batteries
- Mines

When you land the killing blow on another ship, you get an upgrade. The upgrade will be randomly determined.

Possible upgrades:
- Hull Points
- Radar Range
- Radar Sweep Speed
- Ship Max Speed
- Gun Reload
- Gun Range
- Gun Ammo
- Torpedo Reload
- Torpedo Ammo
- Torpedo Speed
- Mine Reload
- Mine Ammo
- Max Mines

We are replacing Cooldowns with the idea of Reload.
Lets remove the separation between port and starboard guns. Imagine you have Gun ammo 2. This means you can store up to 2 shots, and fire them one at a time, or separately, out of either firing arc. Whenever you have fewer than your max ammo, the reload timer will tick. When it fills, you get one ammo back. If you are still below your max ammo, the cooldown will immediately restart. The reload should be indicated by a highly visible vertical line. If you are out of ammo, then and only then should the bar turn grey.

## CHOOSING AN UPGRADE
Lets say there are 5 CATEGORIES of upgrades:
- Ship
- - Hull Durability (Hull Points)
- - Max Speed
- Intel
- - Radar Range
- - Radar Sweep Speed
- - True Sight Range
- Guns
- - Gun Ammo
- - Gun Range
- - Gun Reload
- Torpedos
- - Torpedo Ammo
- - Torpedo Speed
- - Torpedo Reload
- Mines
- - Mine Ammo (How many you can carry at once)
- - Max Mine Placement (How many of your mines can be on the map at once)
- - Mine Reload

Each time you destroy an enemy ship, you will gain an upgrade point.
An indicator will tell you how many upgrade points you have. As long as you have one or more upgrade points, you can press CTRL to open up a selection window, where you can choose between 3 different randomized upgrades (from 3 different random categories), or to heal some amount of hull durability. CTRL+1, CTRL+2, CTRL+3, and CTRL+E (for the heal) are keyboard shortcuts. You can save your upgrade points until a strategically good time to spend them. The upgrades are randomized when you gain the upgrade point, so you can't just close/open the upgrade window to reroll.

## PROBLEMS SO FAR
- Launching torpedos straight forward while moving at full speed often makes them automatically hit your own ship. This sucks. Torps need to start faster than the ships that fire them.
- Guns barely do any damage at all, torps feel about right, but *nothing* should be a 1-hit kill on an otherwise undamaged ship.

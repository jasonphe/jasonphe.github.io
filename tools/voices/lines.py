"""Every voice line the toddler games can say.

Keep these in sync with the games. If a game says something that has no clip,
it falls back to the browser's speech voice and logs "No voice clip for: ..."
in the console, which is the hint to add it here and rerun make_voices.py.
"""


def phrase(name, sound):
    # Same wording as phrase() in ChooChoo and BalloonFloat
    return f"The {name} says {sound}!" if sound else f"A {name}!"


# ---------- Games that look up clips by their text ----------
# Each line becomes voice/<slug>.mp3 next to the game, plus voice/lines.json.

SHAPES = ["circle", "square", "triangle", "star", "heart"]
COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "pink"]

FOODS = ["apple", "banana", "strawberry", "carrot", "cookie", "cheese", "watermelon",
         "grapes", "broccoli", "donut", "pizza", "blueberries", "egg", "orange"]
CRITTERS = ["monster", "frog", "bear", "kitty", "alien", "piggy"]

TRAIN_RIDERS = [("dog", "woof woof"), ("cat", "meow"), ("pig", "oink oink"), ("duck", "quack quack"),
                ("frog", "ribbit"), ("monkey", "ooh ooh ah ah"), ("bunny", None), ("bear", None),
                ("panda", None), ("lion", "roar"), ("penguin", None), ("tiger", None), ("koala", None)]
TRAIN_FIELD = [("cow", "moo"), ("sheep", "baa"), ("horse", "neigh"), ("chicken", "bawk bawk"),
               ("goat", "maa"), ("turkey", "gobble gobble")]
STATIONS = ["Duck Pond", "Apple Town", "Teddy Hill", "Rainbow Stop", "Sunny Farm", "Cookie Corner",
            "Bubble Bay", "Moo Meadow", "Banana Junction", "Sleepy Hollow"]

BALLOON_FRIENDS = [("dog", "woof woof"), ("cat", "meow"), ("cow", "moo"), ("pig", "oink oink"),
                   ("duck", "quack quack"), ("frog", "ribbit"), ("sheep", "baa"), ("monkey", "ooh ooh ah ah"),
                   ("bunny", None), ("bear", None), ("penguin", None), ("panda", None)]

BY_TEXT = {
    "ShapeSorter": (
        ["Let's sort the shapes!", "You did it!"]
        + [f"{s}!" for s in SHAPES]
        + [f"{c} {s}!" for c in COLORS for s in SHAPES]
    ),
    "FeedTheAnimal": (
        ["Hee hee!", "I'm hungry!", "I'm full! Thank you!"]
        + [f"Hi! I'm a hungry {c}!" for c in CRITTERS]
        + [line for f in FOODS for line in (f"{f}!", f"Yummy {f}!", f"Yum, {f}!")]
    ),
    "ChooChoo": (
        ["All aboard! Press the green button to go!", "All aboard!", "Choo choo!", "Bye bye!", "Bye bye, friends!"]
        + [line for s in STATIONS for line in (f"{s}!", f"Next stop, {s}!")]
        + [phrase(n, s) for n, s in TRAIN_RIDERS + TRAIN_FIELD]
    ),
    "BalloonFloat": (
        ["Let's blow up balloons!"]
        + [phrase(n, s) for n, s in BALLOON_FRIENDS]
    ),
}

# ---------- Older games that look up clips by name ----------
# These already have some recordings (.m4a). A clip is only generated when
# there's no recording with that name, so recordings always win.

BY_NAME = {
    "TapZoo": {
        "lets-play": "Let's play!",
        **{n: f"{n}!" for n in ["elephant", "fish", "bunny", "penguin", "turtle", "whale", "butterfly", "bear",
                                "tiger", "giraffe", "octopus", "ant", "koala", "rabbit", "unicorn", "zebra"]},
        # Recorded already, listed so a missing recording still gets a clip
        **{n: f"The {n} says {s}!" for n, s in [
            ("dog", "woof woof"), ("cat", "meow"), ("cow", "moo"), ("pig", "oink oink"), ("duck", "quack quack"),
            ("frog", "ribbit"), ("lion", "roar"), ("sheep", "baa"), ("horse", "neigh"), ("chicken", "bawk bawk"),
            ("owl", "hoo hoo"), ("bee", "buzz"), ("monkey", "ooh ooh ah ah")]},
    },
    # Peekaboo Barn also falls back to TapZoo's clips, so anything recorded
    # there is skipped here too (see RECORDING_DIRS in make_voices.py)
    "PeekabooBarn": {
        "peekaboo": "Peekaboo!",
        "lets-play": "Who's in the barn?",
        **{n: f"Peekaboo! A {n}!" for n in ["bunny", "mouse", "goat", "turkey", "bear"]},
    },
    "WheresTheBall": {
        "wheres-the-ball": "Where's the ball?",
        "peekaboo": "Peekaboo!",
        "there-it-is": "There it is!",
    },
}

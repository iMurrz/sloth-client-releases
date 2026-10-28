(function(root){const themes=[
  {
    "id": "none",
    "name": "Classic Sloth",
    "hue": 330,
    "color": "#ff83bd",
    "description": "Your selected accent, with no seasonal decorations.",
    "motif": "sloth",
    "art": "assets/holiday-none.svg"
  },
  {
    "id": "easter",
    "name": "Easter",
    "hue": 286,
    "color": "#d9abe9",
    "description": "Pastel eggs, spring flowers and gentle lavender.",
    "motif": "egg",
    "art": "assets/holiday-easter.svg"
  },
  {
    "id": "halloween",
    "name": "Halloween",
    "hue": 28,
    "color": "#efab63",
    "description": "Pumpkins, webs and Minecraft Halloween creatures.",
    "motif": "pumpkin",
    "art": "assets/holiday-halloween.svg"
  },
  {
    "id": "thanksgiving",
    "name": "Thanksgiving",
    "hue": 32,
    "color": "#e2b277",
    "description": "Harvest gold, oak leaves and a pumpkin gathering.",
    "motif": "harvest",
    "art": "assets/holiday-thanksgiving.svg"
  },
  {
    "id": "christmas",
    "name": "Christmas",
    "hue": 148,
    "color": "#84d1ac",
    "description": "Evergreen trees, gifts, snow and warm golden stars.",
    "motif": "tree",
    "art": "assets/holiday-christmas.svg"
  }
];if(typeof module==='object'&&module.exports)module.exports=themes;else root.SLOTH_THEMES=themes;})(globalThis);

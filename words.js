// Word lists for Qbism: 'normal' (simple concrete words) and 'advanced' (harder/abstract/landmarks/characters)
const WORDS = {
  en: {
    normal: [
      "pagoda", "santa claus", "eiffel tower", "ship", "giraffe", "cat", "door", "chair", "fire",
      "apple", "banana", "car", "house", "tree", "dog", "sun", "moon", "star",
      "fish", "bird", "boat", "airplane", "bicycle", "table", "book", "key", "clock",
      "shoe", "hat", "glasses", "umbrella", "flower", "mountain", "cloud", "rain", "heart",
      "smile", "eye", "hand", "foot", "pizza", "cake", "ice cream", "coffee", "cup", "bottle",
      "spoon", "fork", "knife", "scissors", "pencil", "phone", "computer", "television", "camera", "guitar",
      "drum", "bell", "crown", "sword", "shield", "castle", "bridge", "train", "bus", "rocket",
      "robot", "ghost", "skull", "spider", "snake", "butterfly", "bee", "elephant", "lion",
      "monkey", "penguin", "turtle", "frog", "whale", "shark", "octopus", "crab", "snail", "mushroom",
      "cactus", "palm tree", "carrot", "corn", "strawberry", "grapes", "watermelon", "pineapple", "cheese", "bread",
      "egg", "hamburger", "fries", "donut", "candy", "lollipop", "balloon", "gift", "candle", "lightbulb",
      "magnet", "anchor", "compass", "map", "flag", "trophy", "medal", "ball", "tennis", "basketball",
      "snowman", "snowflake", "rainbow", "tornado", "volcano", "island", "tent", "campfire", "ladder", "hammer",
      "wrench", "saw", "paintbrush", "bucket", "broom", "soap", "toothbrush", "mirror", "comb", "ring",
      "necklace", "shirt", "pants", "dress", "sock", "glove", "boot", "backpack", "suitcase", "wallet",
      "coin", "diamond", "treasure", "pirate", "wizard", "dragon", "unicorn", "mermaid", "alien", "ufo",
      "helicopter", "tractor", "ambulance", "firetruck", "motorcycle", "scooter", "skateboard", "parachute", "hot air balloon", "lighthouse",
      "windmill", "igloo", "barn", "fountain", "well", "fence", "window", "stairs", "chimney", "roof",
      "bed", "sofa", "lamp", "carpet", "curtain", "pillow", "blanket", "wardrobe", "bathtub", "shower",
      "toilet", "sink", "towel", "washing machine", "fridge", "oven", "toaster", "blender", "teapot", "pan",
      "pot", "plate", "bowl", "straw", "napkin", "trash can", "envelope", "stamp", "newspaper", "calendar"
    ],
    advanced: [
      "shadow", "soul", "vampire", "europe", "pagoda", "santa claus", "eiffel tower",
      "gravity", "nightmare", "silence", "evolution", "time", "infinity", "dream", "echo", "mirage",
      "werewolf", "zombie", "mummy", "centaur", "phoenix", "medusa", "minotaur", "sphinx", "gargoyle",
      "colosseum", "statue of liberty", "great wall", "taj mahal", "pyramids", "stonehenge", "easter island", "big ben", "leaning tower",
      "loch ness", "atlantis", "black hole", "supernova", "eclipse", "constellation", "aurora", "meteorite",
      "tsunami", "avalanche", "earthquake", "whirlpool", "quicksand", "labyrinth", "oasis", "portal",
      "electricity", "magnetism", "radiation", "dna", "atom", "microscope", "telescope", "time machine", "cyborg",
      "excalibur", "trojan horse", "frankenstein", "dracula", "pinocchio", "sherlock holmes", "cleopatra", "gladiator",
      "samurai", "ninja", "viking", "astronaut", "alchemist", "plague doctor", "scarecrow", "grim reaper",
      "chameleon", "platypus", "narwhal", "praying mantis", "venus flytrap", "bonsai", "origami", "matryoshka",
      "voodoo doll", "hourglass", "guillotine", "catapult", "submarine", "zeppelin", "chariot", "gondola", "totem",
      "italy", "africa", "antarctica", "australia", "japan", "egypt", "olympus", "hell", "heaven",
      "yin yang", "karma", "destiny", "freedom", "justice", "chaos", "peace", "illusion", "secret",
      "jealousy", "memory", "paradox", "curse", "hypnosis", "telepathy", "levitation", "camouflage", "metamorphosis", "hibernation"
    ]
  },
  it: {
    normal: [
      "pagoda", "babbo natale", "torre eiffel", "nave", "giraffa", "gatto", "porta", "sedia", "fuoco",
      "mela", "banana", "auto", "casa", "albero", "cane", "sole", "luna", "stella",
      "pesce", "uccello", "barca", "aereo", "bicicletta", "tavolo", "libro", "chiave", "orologio",
      "scarpa", "cappello", "occhiali", "ombrello", "fiore", "montagna", "nuvola", "pioggia", "cuore",
      "sorriso", "occhio", "mano", "piede", "pizza", "torta", "gelato", "caffe", "tazza", "bottiglia",
      "cucchiaio", "forchetta", "coltello", "forbici", "matita", "telefono", "computer", "televisore", "fotocamera", "chitarra",
      "tamburo", "campana", "corona", "spada", "scudo", "castello", "ponte", "treno", "autobus", "razzo",
      "robot", "fantasma", "teschio", "ragno", "serpente", "farfalla", "ape", "elefante", "leone",
      "scimmia", "pinguino", "tartaruga", "rana", "balena", "squalo", "polpo", "granchio", "lumaca", "fungo",
      "cactus", "palma", "carota", "mais", "fragola", "uva", "anguria", "ananas", "formaggio", "pane",
      "uovo", "hamburger", "patatine", "ciambella", "caramella", "leccalecca", "palloncino", "regalo", "candela", "lampadina",
      "magnete", "ancora", "bussola", "mappa", "bandiera", "trofeo", "medaglia", "palla", "tennis", "basket",
      "pupazzo di neve", "fiocco di neve", "arcobaleno", "tornado", "vulcano", "isola", "tenda", "falo", "scala", "martello",
      "chiave inglese", "sega", "pennello", "secchio", "scopa", "sapone", "spazzolino", "specchio", "pettine", "anello",
      "collana", "maglietta", "pantaloni", "vestito", "calzino", "guanto", "stivale", "zaino", "valigia", "portafoglio",
      "moneta", "diamante", "tesoro", "pirata", "mago", "drago", "unicorno", "sirena", "alieno", "ufo",
      "elicottero", "trattore", "ambulanza", "camion pompieri", "motocicletta", "monopattino", "skateboard", "paracadute", "mongolfiera", "faro",
      "mulino", "igloo", "fontana", "pozzo", "staccionata", "finestra", "camino", "tetto", "letto", "divano",
      "lampada", "tappeto", "cuscino", "coperta", "armadio", "vasca", "doccia", "lavandino", "frigorifero", "forno",
      "tostapane", "teiera", "padella", "pentola", "piatto", "ciotola", "cannuccia", "cestino", "busta", "giornale"
    ],
    advanced: [
      "ombra", "anima", "vampiro", "europa", "pagoda", "babbo natale", "torre eiffel",
      "gravita", "incubo", "silenzio", "evoluzione", "tempo", "infinito", "sogno", "eco", "miraggio",
      "licantropo", "zombie", "mummia", "centauro", "fenice", "medusa", "minotauro", "sfinge", "gargoyle",
      "colosseo", "statua della liberta", "grande muraglia", "taj mahal", "piramidi", "stonehenge", "isola di pasqua", "big ben", "torre di pisa",
      "loch ness", "atlantide", "buco nero", "supernova", "eclissi", "costellazione", "aurora", "meteorite",
      "tsunami", "valanga", "terremoto", "vortice", "sabbie mobili", "labirinto", "oasi", "portale",
      "elettricita", "magnetismo", "radiazione", "dna", "atomo", "microscopio", "telescopio", "macchina del tempo", "cyborg",
      "excalibur", "cavallo di troia", "frankenstein", "dracula", "pinocchio", "sherlock holmes", "cleopatra", "gladiatore",
      "samurai", "ninja", "vichingo", "astronauta", "alchimista", "medico della peste", "spauracchio", "tristo mietitore",
      "camaleonte", "ornitorinco", "narvalo", "mantide religiosa", "pianta carnivora", "bonsai", "origami", "matrioska",
      "bambola voodoo", "clessidra", "ghigliottina", "catapulta", "sottomarino", "dirigibile", "biga", "gondola", "totem",
      "italia", "africa", "antartide", "australia", "giappone", "egitto", "olimpo", "inferno", "paradiso",
      "yin yang", "karma", "destino", "liberta", "giustizia", "caos", "pace", "illusione", "segreto",
      "gelosia", "memoria", "paradosso", "maledizione", "ipnosi", "telepatia", "levitazione", "mimetismo", "metamorfosi", "letargo"
    ]
  }
};

module.exports = WORDS;

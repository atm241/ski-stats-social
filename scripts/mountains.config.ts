/**
 * The 3D mountains we build (npx tsx scripts/build-all.ts <slug>). Each combines one or more resorts
 * from data/resorts.json and lists landmarks the viewer can fly to.
 *
 * A landmark sits at a run's midpoint (`run`, exact OSM name), a named peak (`peak`), the middle of a named
 * terrain park or halfpipe (`park`), or a fixed [lon, lat].
 */
import type { ParkLine } from "../src/lib/mountain/types";

export interface LandmarkSpec {
  name: string;
  kind: "cliff" | "park" | "pipe" | "peak";
  run?: string;
  peak?: string;
  park?: string;
  at?: [number, number];
}
export interface MountainConfig {
  name: string;
  resorts: string[];
  landmarks: LandmarkSpec[];
  /** park features OpenStreetMap doesn't have; coords run downhill, [lon, lat] */
  parks?: { name: string; kind: "park" | "pipe"; coords: [number, number][]; line?: ParkLine }[];
  /**
   * Runs that are terrain parks though OSM doesn't tag them so (Keystone's A51: Main Street, Park Lane…).
   * The park follows the run's line; `name` defaults to the run's.
   */
  parkRuns?: { run: string; name?: string; line?: ParkLine }[];
}

export const MOUNTAINS: Record<string, MountainConfig> = {
  "deer-valley": {
    name: "Deer Valley Resort",
    resorts: ["Deer Valley Resort"],
    landmarks: [
      { name: "Daly Chutes", kind: "cliff", at: [-111.5185, 40.6097] },
      // rock band the Lady Morgan Express crosses partway up (found in USGS lidar)
      { name: "Lady Morgan cliffs", kind: "cliff", at: [-111.5132, 40.6214] },
      { name: "Mayflower Bowl", kind: "cliff", run: "Mayflower Bowl" },
      { name: "Stein's Way", kind: "cliff", run: "Stein's Way" },
      { name: "Bald Mountain", kind: "peak", peak: "Bald Mountain" },
    ],
  },
  "snowbird-alta": {
    name: "Snowbird & Alta",
    resorts: ["Snowbird", "Alta Ski Area"],
    landmarks: [
      { name: "The Cirque", kind: "cliff", run: "Upper Cirque" },
      { name: "Great Scott", kind: "cliff", run: "Great Scott" },
      { name: "Pipeline Couloir", kind: "cliff", run: "Pipeline Couloir" },
      { name: "Baldy Main Chute", kind: "cliff", run: "Main Chute" },
      { name: "Alf's High Rustler", kind: "cliff", run: "Alf's High Rustler" },
      { name: "Devil's Castle", kind: "peak", peak: "Devil's Castle" },
    ],
  },
  "a-basin": {
    name: "Arapahoe Basin",
    resorts: ["Arapahoe Basin"],
    landmarks: [
      { name: "East Wall", kind: "cliff", run: "East Wall Traverse" },
      { name: "Pallavicini", kind: "cliff", run: "Pali Face" },
      { name: "Steep Gullies", kind: "cliff", run: "Steep Gully 3" },
      { name: "North Pole", kind: "cliff", run: "North Pole" },
      { name: "Montezuma Bowl", kind: "cliff", run: "Zuma Cornice" },
      { name: "Lenawee Mountain", kind: "peak", peak: "Lenawee Mountain" },
    ],
  },
  "park-city": {
    name: "Park City Mountain",
    // OpenSkiMap's "Park City Mountain Resort" already spans the Canyons Village side.
    resorts: ["Park City Mountain Resort"],
    landmarks: [
      { name: "Superpipe", kind: "pipe", at: [-111.511647, 40.651525] },
      { name: "3 Kings park", kind: "park", run: "3 Kings" },
      { name: "McConkey's Bowl", kind: "cliff", run: "McConkey's Bowl" },
      { name: "Jupiter Peak", kind: "peak", peak: "Jupiter Peak" },
      { name: "Squaretop (Canyons)", kind: "peak", peak: "Squaretop" },
    ],
    parks: [
      {
        // Utah's first superpipe (700 ft, 22 ft walls), built for The Snow League's Jan 2027 event.
        // Not in OSM yet: placed on the new earthwork visible in Sentinel-2 imagery from Aug-Sep 2026,
        // in the 3 Kings / Pick'n Shovel park above the base. Centre ±106 m along the strip's 31° bearing.
        name: "Superpipe",
        kind: "pipe",
        coords: [
          [-111.512284, 40.650697],
          [-111.511011, 40.652353],
        ],
      },
    ],
  },
  "jackson-hole": {
    name: "Jackson Hole",
    resorts: ["Jackson Hole Mountain Resort"],
    landmarks: [
      { name: "Corbet's Couloir", kind: "cliff", run: "Corbet's Couloir" },
      { name: "S&S Couloir", kind: "cliff", run: "S&S Couloir" },
      { name: "Rendezvous Bowl", kind: "cliff", run: "Rendezvous Bowl" },
      { name: "Expert Chutes", kind: "cliff", run: "Expert Chutes" },
      { name: "Alta Chutes", kind: "cliff", run: "Alta Chute 2" },
      { name: "Rendezvous Mountain", kind: "peak", peak: "Rendezvous Mountain" },
    ],
  },
  "big-sky": {
    name: "Big Sky",
    resorts: ["Big Sky Resort"],
    landmarks: [
      { name: "Big Couloir", kind: "cliff", run: "Big Couloir" },
      { name: "Lone Peak", kind: "peak", peak: "Lone Mountain" },
      { name: "North Summit Snowfield", kind: "cliff", run: "North Summit Snowfield" },
      { name: "Headwaters", kind: "cliff", run: "Headwaters Bowl" },
      { name: "Dictator Chutes", kind: "cliff", run: "Dictator Chutes" },
      { name: "Liberty Bowl", kind: "cliff", run: "Liberty Bowl" },
    ],
  },
  "brighton-solitude": {
    name: "Brighton & Solitude",
    resorts: ["Brighton Resort", "Solitude Mountain Resort"],
    landmarks: [
      { name: "Honeycomb Canyon", kind: "cliff", run: "Honeycomb Chutes" },
      { name: "Black Bess Chutes", kind: "cliff", run: "Black Bess Chutes" },
      { name: "Cathedral Cirque", kind: "cliff", run: "Cathedral Cirque" },
      { name: "Powderhorn Cirque", kind: "cliff", run: "Powderhorn Cirque" },
      { name: "Mount Millicent", kind: "peak", peak: "Mount Millicent" },
    ],
  },
  "vail": {
    name: "Vail",
    resorts: ["Vail"],
    landmarks: [
      { name: "Prima Cornice", kind: "cliff", run: "Prima Cornice" },
      { name: "Highline", kind: "cliff", run: "Highline" },
      { name: "Riva Ridge", kind: "cliff", run: "Riva Ridge" },
      { name: "Mongolia Bowls", kind: "cliff", run: "Outer Mongolia Bowl" },
      { name: "Golden Peak park", kind: "park", park: "Golden Peak Terrain Park" },
      { name: "Vail Mountain", kind: "peak", peak: "Vail Mountain" },
    ],
  },
  "breckenridge": {
    name: "Breckenridge",
    resorts: ["Breckenridge"],
    landmarks: [
      { name: "Imperial Ridge", kind: "cliff", run: "Imperial Ridge" },
      { name: "Horseshoe Bowl", kind: "cliff", run: "Horseshoe Bowl Traverse" },
      { name: "Mustang", kind: "cliff", run: "Mustang" },
      { name: "Freeway park & pipe", kind: "pipe", park: "Freeway Terrain Park & Pipe" },
      { name: "Peak 8", kind: "peak", peak: "Peak 8" },
      { name: "Peak 6", kind: "peak", peak: "Peak 6" },
    ],
  },
  "telluride": {
    name: "Telluride",
    resorts: ["Telluride Ski Area"],
    landmarks: [
      { name: "Palmyra Peak", kind: "peak", peak: "Palmyra Peak" },
      { name: "Gold Hill Chutes", kind: "cliff", run: "Gold Hill 6" },
      { name: "The Plunge", kind: "cliff", run: "The Plunge" },
      { name: "Kant-Mak-M", kind: "cliff", run: "Kant-Mak-M" },
      { name: "Spiral Stairs", kind: "cliff", run: "Spiral Stairs" },
    ],
  },
  "mammoth": {
    name: "Mammoth Mountain",
    resorts: ["Mammoth Mountain"],
    landmarks: [
      { name: "Hangman's Hollow", kind: "cliff", run: "Hangman's Hollow" },
      { name: "Climax", kind: "cliff", run: "Climax" },
      { name: "Cornice Bowl", kind: "cliff", run: "Cornice Bowl" },
      { name: "Wipeout Chutes", kind: "cliff", run: "Wipeout Chute 2" },
      { name: "Main Park halfpipe", kind: "pipe", park: "Main Park Half Pipe" },
    ],
  },
  "palisades-tahoe": {
    name: "Palisades Tahoe",
    resorts: ["Palisades Tahoe Olympic Valley", "Palisades Tahoe Alpine Meadows"],
    landmarks: [
      { name: "KT-22", kind: "peak", peak: "KT-22" },
      { name: "The Fingers", kind: "cliff", run: "Fingers" },
      { name: "Palisades", kind: "cliff", run: "West Palisades" },
      { name: "Headwall", kind: "cliff", run: "Headwall Face" },
      { name: "Granite Chief", kind: "peak", peak: "Granite Chief" },
      { name: "Beaver Bowl (Alpine)", kind: "cliff", run: "Beaver Bowl" },
    ],
  },
  "snowbasin": {
    name: "Snowbasin",
    resorts: ["Snowbasin Resort"],
    landmarks: [
      { name: "Mount Ogden", kind: "peak", peak: "Mount Ogden" },
      { name: "Grizzly Downhill", kind: "cliff", run: "Grizzly Downhill" },
      { name: "John Paul Face", kind: "cliff", run: "John Paul Face" },
      { name: "Mt. Ogden Chute", kind: "cliff", run: "Mt. Ogden Chute" },
      { name: "Allen Peak", kind: "peak", peak: "Allen Peak" },
    ],
  },
  "sun-valley": {
    name: "Sun Valley",
    resorts: ["Sun Valley - Bald Mountain", "Sun Valley - Dollar Mountain"],
    landmarks: [
      { name: "Bald Mountain", kind: "peak", peak: "Bald Mountain" },
      { name: "Christmas Bowl", kind: "cliff", run: "Christmas Bowl" },
      { name: "Mayday Bowl", kind: "cliff", run: "Mayday Bowl" },
      { name: "Limelight", kind: "cliff", run: "Upper Limelight" },
      { name: "Warm Springs", kind: "cliff", run: "Warm Springs Face" },
      { name: "Exhibition", kind: "cliff", run: "Exhibition" },
    ],
  },
  "taos": {
    name: "Taos Ski Valley",
    resorts: ["Taos Ski Valley"],
    landmarks: [
      { name: "Kachina Peak", kind: "peak", peak: "Kachina Peak" },
      { name: "Highline Ridge", kind: "cliff", run: "Highline Ridge" },
      { name: "West Basin Ridge", kind: "cliff", run: "West Basin Ridge" },
      { name: "Al's Run", kind: "cliff", run: "Al's Run" },
      { name: "Stauffenberg", kind: "cliff", run: "Stauffenberg" },
      { name: "Juarez", kind: "cliff", run: "Juarez" },
    ],
  },
  "crested-butte": {
    name: "Crested Butte",
    resorts: ["Crested Butte Mountain Resort"],
    landmarks: [
      { name: "The North Face", kind: "cliff", run: "The North Face" },
      { name: "Rambo", kind: "cliff", run: "Rambo" },
      { name: "Banana", kind: "cliff", run: "Banana" },
      { name: "Headwall", kind: "cliff", run: "Headwall Ridge Traverse" },
      { name: "Third Bowl", kind: "cliff", run: "Third Bowl" },
      { name: "Crested Butte", kind: "peak", peak: "Crested Butte" },
    ],
  },
  "aspen-highlands": {
    name: "Aspen Highlands",
    resorts: ["Aspen Highlands"],
    landmarks: [
      { name: "Highland Bowl", kind: "peak", peak: "Highland Peak" },
      { name: "G-Zones", kind: "cliff", run: "G-4" },
      { name: "Ozone", kind: "cliff", run: "Ozone" },
      { name: "Kessler's", kind: "cliff", run: "Kessler's" },
      { name: "Deception", kind: "cliff", run: "Deception" },
      { name: "Loge Peak", kind: "peak", peak: "Loge Peak" },
    ],
  },
  "aspen-mountain": {
    name: "Aspen Mountain",
    resorts: ["Aspen Mountain"],
    landmarks: [
      { name: "Walsh's", kind: "cliff", run: "Walsh's" },
      { name: "Kristi", kind: "cliff", run: "Kristi" },
      { name: "Silver Queen", kind: "cliff", run: "Silver Queen" },
      { name: "Ridge of Bell", kind: "cliff", run: "Ridge of Bell" },
      { name: "Bell Mountain", kind: "peak", peak: "Bell Mountain" },
      { name: "Aspen Mountain", kind: "peak", peak: "Aspen Mountain" },
    ],
  },
  "snowmass": {
    name: "Snowmass",
    resorts: ["Aspen Snowmass"],
    landmarks: [
      { name: "The Cirque", kind: "cliff", run: "Cirque Headwall" },
      { name: "Hanging Valley", kind: "cliff", run: "Hanging Valley Glades" },
      { name: "The Wall", kind: "cliff", run: "Wall 1" },
      { name: "Rock Island", kind: "cliff", run: "Rock Island" },
      { name: "Sam's Knob", kind: "peak", peak: "Sam's Knob" },
    ],
  },
  "steamboat": {
    name: "Steamboat",
    resorts: ["Steamboat Ski Resort"],
    landmarks: [
      { name: "Mount Werner", kind: "peak", peak: "Mount Werner" },
      { name: "Christmas Tree Bowl", kind: "cliff", run: "Christmas Tree Bowl" },
      { name: "North St. Pat's", kind: "cliff", run: "North St Pats" },
      { name: "The Chutes", kind: "cliff", run: "Chute 1" },
      { name: "Mavericks superpipe", kind: "pipe", park: "Maverick's Half Pipe" },
      { name: "Storm Peak", kind: "peak", peak: "Storm Peak" },
    ],
  },
  "copper": {
    name: "Copper Mountain",
    resorts: ["Copper Mountain"],
    landmarks: [
      { name: "Tucker Mountain", kind: "peak", peak: "Tucker Mountain" },
      { name: "Spaulding Ridge", kind: "cliff", run: "Spaulding Ridge" },
      { name: "Union Peak", kind: "cliff", run: "Union Peak" },
      { name: "Hallelujah", kind: "cliff", run: "Hallelujah" },
      { name: "The Taco", kind: "cliff", run: "The Taco / Curecanti" },
      { name: "Copper Mountain", kind: "peak", peak: "Copper Mountain" },
    ],
  },
  "keystone": {
    name: "Keystone",
    resorts: ["Keystone"],
    landmarks: [
      { name: "The Outback", kind: "cliff", run: "Bushwhacker" },
      { name: "South Bowl", kind: "cliff", run: "South bowl" },
      { name: "Puma Bowl", kind: "cliff", run: "Puma Bowl" },
      { name: "A51", kind: "park", park: "Main Street" },
      { name: "Independence Mountain", kind: "peak", peak: "Independence Mountain" },
    ],
    // A51 terrain park (own lift, A-51): Main Street is the big jump line, Park Lane and The Alley jibs,
    // I-70 the progression park. OSM maps them as plain runs.
    parkRuns: [
      { run: "Main Street", line: "jumps" },
      { run: "Park Lane", line: "mixed" },
      { run: "The Alley", line: "jibs" },
      { run: "I-70", line: "mixed" },
    ],
  },
  "beaver-creek": {
    name: "Beaver Creek",
    resorts: ["Beaver Creek"],
    landmarks: [
      { name: "Birds of Prey", kind: "cliff", run: "Golden Eagle-Upper" },
      { name: "Stone Creek Chutes", kind: "cliff", run: "Upper Stone Creek" },
      { name: "Royal Elk Glade", kind: "cliff", run: "Royal Elk Glade" },
      { name: "Peregrine", kind: "cliff", run: "Peregrine" },
      { name: "Larkspur Bowl", kind: "cliff", run: "Larkspur Bowl" },
      { name: "Bachelor Gulch Mountain", kind: "peak", peak: "Bachelor Gulch Mountain" },
    ],
  },
  "winter-park": {
    name: "Winter Park",
    resorts: ["Winter Park Resort"],
    landmarks: [
      { name: "Vasquez Cirque", kind: "cliff", run: "Vasquez Cirque Access" },
      { name: "Mary Jane", kind: "cliff", run: "Mary Jane Upper" },
      { name: "Outhouse", kind: "cliff", run: "Outhouse" },
      { name: "Hole-In-The-Wall", kind: "cliff", run: "Hole-In-The-Wall" },
      { name: "Railyard park", kind: "park", park: "Railyard" },
      { name: "Parsenn Bowl", kind: "peak", peak: "Parsenn Bowl" },
    ],
  },

  // --- the rest of the big Epic and Ikon mountains (landmarks picked automatically until curated)
  "whistler-blackcomb": { name: "Whistler Blackcomb", resorts: ["Whistler Blackcomb"], landmarks: [{ name: "Saudan Couloir", kind: "cliff", run: "Saudan Couloir" }, { name: "Spanky's Chute", kind: "cliff", run: "Spanky's Chute" }, { name: "Blackcomb Glacier", kind: "cliff", run: "Blackcomb Glacier" }, { name: "Body Bag Bowl", kind: "cliff", run: "Body Bag Bowl" }, { name: "Glacier Bowl", kind: "cliff", run: "Glacier Bowl" }, { name: "Peak to Creek", kind: "cliff", run: "Peak to Creek - Upper" }, { name: "Whistler Peak", kind: "peak", peak: "Whistler Mountain" }, { name: "Blackcomb Peak", kind: "peak", peak: "Blackcomb Peak" }] },
  "heavenly": { name: "Heavenly", resorts: ["Heavenly Mountain Resort"], landmarks: [{ name: "Mott Canyon", kind: "cliff", run: "Mott Canyon Trail" }, { name: "Gunbarrel", kind: "cliff", run: "Gunbarrel" }, { name: "Milky Way Bowl", kind: "cliff", run: "Milky Way Bowl" }, { name: "Ellie's", kind: "cliff", run: "Ellie's" }, { name: "Monument Peak", kind: "peak", peak: "Monument Peak" }] },
  "northstar": { name: "Northstar", resorts: ["Northstar at Tahoe Resort"], landmarks: [] },
  "kirkwood": { name: "Kirkwood", resorts: ["Kirkwood Mountain Resort"], landmarks: [{ name: "The Wall", kind: "cliff", run: "The Wall" }, { name: "Thunder Saddle", kind: "cliff", run: "Thunder Saddle" }, { name: "Sentinel", kind: "cliff", run: "Sentinel" }, { name: "Eagle Bowl", kind: "cliff", run: "Eagle Bowl" }, { name: "Thimble Peak", kind: "peak", peak: "Thimble Peak" }] },
  "stowe": { name: "Stowe", resorts: ["Stowe Mountain Resort"], landmarks: [{ name: "Goat", kind: "cliff", run: "Goat" }, { name: "Starr", kind: "cliff", run: "Starr" }, { name: "National", kind: "cliff", run: "National" }, { name: "Liftline", kind: "cliff", run: "Liftline" }, { name: "Mount Mansfield", kind: "peak", peak: "Mount Mansfield" }] },
  "stevens-pass": { name: "Stevens Pass", resorts: ["Stevens Pass"], landmarks: [] },
  "okemo": { name: "Okemo", resorts: ["Okemo Mountain"], landmarks: [] },
  "mount-snow": { name: "Mount Snow", resorts: ["Mount Snow"], landmarks: [] },
  "kicking-horse": { name: "Kicking Horse", resorts: ["Kicking Horse Resort"], landmarks: [{ name: "Terminator", kind: "cliff", run: "Terminator" }, { name: "Redemption Ridge", kind: "cliff", run: "Redemption Ridge Traverse" }, { name: "Terminator Peak", kind: "peak", peak: "Terminator Peak" }, { name: "Whitetooth", kind: "peak", peak: "Whitetooth" }] },
  "fernie": { name: "Fernie", resorts: ["Fernie Alpine Resort"], landmarks: [] },
  "revelstoke": { name: "Revelstoke", resorts: ["Revelstoke Mountain Resort"], landmarks: [{ name: "Greely Bowl", kind: "cliff", run: "Greely Bowl" }, { name: "Kill The Banker", kind: "cliff", run: "Kill The Banker" }, { name: "Mount Mackenzie", kind: "peak", peak: "Mount Mackenzie" }] },
  "lake-louise": { name: "Lake Louise", resorts: ["Lake Louise Ski Area"], landmarks: [{ name: "Paradise Bowl", kind: "cliff", run: "Paradise Bowl" }, { name: "Paradise Cornice", kind: "cliff", run: "Paradise Cornice" }, { name: "Whitehorn Mountain", kind: "peak", peak: "Whitehorn Mountain" }] },
  "sunshine-village": { name: "Banff Sunshine", resorts: ["Banff Sunshine Village"], landmarks: [{ name: "Bye Bye Bowl", kind: "cliff", run: "Bye Bye Bowl" }, { name: "Goat's Head Soup", kind: "cliff", run: "Goat's Head Soup" }, { name: "Lookout Mountain", kind: "peak", peak: "Lookout Mountain" }, { name: "Eagle Mountain", kind: "peak", peak: "Eagle Mountain" }] },
  "sun-peaks": { name: "Sun Peaks", resorts: ["Sun Peaks Resort"], landmarks: [] },
  "tremblant": { name: "Tremblant", resorts: ["Mont Tremblant Resort"], landmarks: [] },
  "killington": { name: "Killington", resorts: ["Killington Resort"], landmarks: [{ name: "Outer Limits", kind: "cliff", run: "Outer Limits" }, { name: "Superstar", kind: "cliff", run: "Superstar" }, { name: "Devil's Fiddle", kind: "cliff", run: "Devil's Fiddle" }, { name: "Killington Peak", kind: "peak", peak: "Killington Peak" }] },
  "sugarbush": { name: "Sugarbush", resorts: ["Sugarbush Resort"], landmarks: [] },
  "sugarloaf": { name: "Sugarloaf", resorts: ["Sugarloaf"], landmarks: [] },
  "sunday-river": { name: "Sunday River", resorts: ["Sunday River"], landmarks: [] },
  "stratton": { name: "Stratton", resorts: ["Stratton Mountain Resort"], landmarks: [] },
  "crystal-mountain": { name: "Crystal Mountain", resorts: ["Crystal Mountain"], landmarks: [{ name: "Silver King", kind: "peak", peak: "Silver King" }, { name: "The Throne", kind: "peak", peak: "The Throne" }, { name: "Lucky Shot", kind: "cliff", run: "Lucky Shot" }] },
  "mt-bachelor": { name: "Mt. Bachelor", resorts: ["Mt. Bachelor"], landmarks: [] },
  "schweitzer": { name: "Schweitzer", resorts: ["Schweitzer Mountain Resort"], landmarks: [] },
  "alyeska": { name: "Alyeska", resorts: ["Alyeska Resort"], landmarks: [] },
  "big-bear": { name: "Big Bear Mountain Resort", resorts: ["Bear Mountain", "Snow Summit"], landmarks: [] },
  "snowshoe": { name: "Snowshoe", resorts: ["Snowshoe Mountain"], landmarks: [] },
  "loon": { name: "Loon Mountain", resorts: ["Loon Mountain Resort"], landmarks: [] },
  "red-mountain": { name: "RED Mountain", resorts: ["Red Mountain Resort"], landmarks: [] },
  "panorama": { name: "Panorama", resorts: ["Panorama Mountain Resort"], landmarks: [] },
  "blue-mountain": { name: "Blue Mountain", resorts: ["Blue Mountain Ski Resort"], landmarks: [] },
};

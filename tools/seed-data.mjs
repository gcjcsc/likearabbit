// The starting herd, transcribed from the paper pedigrees MCF received with each rabbit.
// Each rabbit has a `key` so sires and dams can point at each other; an ancestor that shows up
// in more than one pedigree (Fable, HB/E 202, CW, Hershel, Michonne) is entered once and shared.
// `status: "herd"` marks MCF's own rabbits; everything else is an ancestor known only from a pedigree.
// Weights, genotypes and dates are copied as printed, blanks left blank.

export const rabbits = [
  // ---- Blue Doe (SARF2) and Tri Doe (SATF1), both from S & A Rabbitry, both by Fable ----
  { key: "SARF2", name: "Blue Doe", ear: "SARF2", sex: "doe", color: "Blue Otter", genotype: "at_ B_ C_ dd E_", dob: "2025-01-30", breeder: "S & A Rabbitry", status: "herd", sire: "FABLE", dam: "RIPPLE" },
  { key: "SATF1", name: "Tri Doe", ear: "SATF1", sex: "doe", color: "Black Orange Tri-color", genotype: "A_ B_ C_ D_ eje", dob: "2025-01-05", breeder: "S & A Rabbitry", status: "herd", notes: "\"Jessica's Doe\" is handwritten on the pedigree.", sire: "FABLE", dam: "TRIXIE" },

  { key: "FABLE", name: "Reining Rabbits Fable", sex: "buck", color: "Blue/Fawn Harlequin", weight: "8 lbs 4 oz", dob: "2024-07-25", breeder: "Reining Rabbits", sire: "REMI", dam: "BABYRUTH" },
  { key: "REMI", name: "Reining Rabbit's Remi", ear: "REMI", sex: "buck", color: "Blue/Fawn Tri-color", genotype: "A_ B_ C_ dd ej_", weight: "7 lbs 8 oz", dob: "2023-12-30", breeder: "Reining Rabbits", sire: "DANIEL", dam: "LADY" },
  { key: "DANIEL", name: "Stacy's Daniel", ear: "DANIEL", sex: "buck", color: "Castor", genotype: "A_ B_ C_ D_ E_", weight: "7 lbs 8 oz", breeder: "Stacy's" },
  { key: "LADY", name: "Stacy's Lady", ear: "LADY", sex: "doe", color: "Black Otter (Broken)", genotype: "at_ B_ C_ D_ E_ *", weight: "8 lbs", breeder: "Stacy's" },
  { key: "BABYRUTH", name: "RLFH's Baby Ruth", ear: "EAR1", sex: "doe", color: "Black/Orange Harlequin", genotype: "A_ B_ C_ D_ ej_", weight: "8 lbs 6 oz", breeder: "RLFH", sire: "JAGERMEISTER", dam: "MIMOSA" },
  { key: "JAGERMEISTER", name: "Upward Acre's Jagermeister", ear: "JAGERMEISTER", sex: "buck", color: "Black/Orange Harlequin", genotype: "A_ B_ C_ D_ ej_", weight: "7 lbs 8 oz", breeder: "Upward Acres" },
  { key: "MIMOSA", name: "Mimosa", sex: "doe", color: "Black/Orange Tri-color", genotype: "A_ B_ C_ D_ eje", weight: "8 lbs 2 oz" },

  { key: "RIPPLE", name: "Fisher's Ripple", ear: "RIPPLE", sex: "doe", color: "Black (Broken)", genotype: "aa B_ C_ D_ E_ *", weight: "7 lbs 13 oz", dob: "2024-04-26", breeder: "Fisher's", sire: "DREAMON", dam: "MEIJER" },
  { key: "DREAMON", name: "Fishers/Georgias Dream On", ear: "DREAMON", sex: "buck", color: "Black Otter (Broken)", genotype: "ata B_ C_ Dd E_ *", weight: "8 lbs 4 oz", dob: "2023-02-07", breeder: "Fisher's", sire: "DREAM", dam: "DAK" },
  { key: "DREAM", name: "Fishers Broken Dreams", ear: "DREAM", sex: "buck", color: "Black Otter (Broken)", genotype: "at_ B_ C_ D_ E_ *", weight: "7 lbs", dob: "2022-06-06", breeder: "Fisher's" },
  { key: "DAK", name: "Georgias Dak", ear: "DA", sex: "doe", color: "Black", genotype: "aa B_ C_ D_ E_", reg: "Q1745", weight: "8 lbs 4 oz", breeder: "Georgias" },
  { key: "MEIJER", name: "Fisher's Meijer", ear: "MEI", sex: "doe", color: "Black Otter (Broken)", genotype: "ata B_ C_ Dd E_ *", weight: "8 lbs 6 oz", dob: "2022-12-24", breeder: "Fisher's", sire: "50DA1", dam: "FROG" },
  { key: "50DA1", name: "Deckers 50DA1", ear: "50DA1", sex: "buck", color: "Black Otter", genotype: "at_ B_ C_ D_ E_", weight: "8 lbs 12 oz", dob: "2020-05-13", breeder: "Deckers" },
  { key: "FROG", name: "DH's Frog", ear: "FROG", sex: "doe", color: "Blue Otter (Broken)", genotype: "ata Bb Cc dd E_ *", reg: "G362S", legs: "2", weight: "8 lbs 12 oz", dob: "2021-01-31", breeder: "DH's" },

  { key: "TRIXIE", name: "Trixie", ear: "SAT1", sex: "doe", color: "Black Orange Tri-color", genotype: "A_ B_ Cc D_ eje", weight: "9 lbs 8 oz", dob: "2022-04-18", breeder: "S & A Rabbitry", sire: "HERSHEYKISS", dam: "PEBBLES" },
  { key: "HERSHEYKISS", name: "Hershey Kiss", sex: "buck", color: "Blue/Fawn Tri-color", genotype: "A_ B_ C_ dd ej_" },
  { key: "PEBBLES", name: "Pebbles", sex: "doe", color: "Black Orange Tri-color", genotype: "A_ B_ C_ D_ eje", weight: "9 lbs" },

  // ---- Abyss (WT71), Walking Tree Rabbitry ----
  { key: "WT71", name: "WalkingTree's Abyss", ear: "WT71", sex: "buck", color: "Broken Black", dob: "2024-09-28", breeder: "Walking Tree Rabbitry", status: "herd", sire: "FPXM6", dam: "LS0274" },
  { key: "FPXM6", name: "FP Menace to Society", ear: "FPXM6", sex: "buck", color: "Broken Black", weight: "7.5 lbs", dob: "2023-06-23", breeder: "FP", sire: "KISS", dam: "GIA" },
  { key: "KISS", name: "Barrons Keep It Simple", ear: "KISS", sex: "buck", color: "Otter-Black", reg: "J410S", weight: "8.7 lbs", breeder: "Barrons", sire: "FLOOD", dam: "DAISY" },
  { key: "FLOOD", name: "Barrons Flood", ear: "FLOOD", sex: "buck", color: "Broken Otter-Black", reg: "K215S", gc: "T1338", legs: "3", weight: "9.6 lbs", breeder: "Barrons" },
  { key: "DAISY", name: "Barrons Daisy", ear: "DAISY", sex: "doe", color: "Broken Otter-Black", weight: "8.12 lbs", breeder: "Barrons" },
  { key: "GIA", name: "Barrons Gia", ear: "GIA", sex: "doe", color: "Broken Black", weight: "6.6 lbs", breeder: "Barrons", sire: "GQ", dam: "TIA" },
  { key: "GQ", name: "Barrons Mister GQ", ear: "GQ", sex: "buck", color: "Broken Otter-Black", breeder: "Barrons" },
  { key: "TIA", name: "Valley Views Tia", ear: "TIA", sex: "doe", color: "REW", breeder: "Valley Views" },
  { key: "LS0274", name: "Lusos Bluebell", ear: "LS0274", sex: "doe", color: "Broken Blue", weight: "8 lbs", dob: "2024-01-14", breeder: "Lusos", sire: "CW", dam: "GENESIS" },
  { key: "CW", name: "Szychulda CW", ear: "CW", sex: "buck", color: "Broken Blue", reg: "G328S", gc: "U957", legs: "4", weight: "7.14 lbs", dob: "2021-10-06", breeder: "Szychulda", sire: "CARLO", dam: "WG" },
  { key: "CARLO", name: "Szychulda Carlo", ear: "CARLO", sex: "buck", color: "Broken Black", weight: "9.4 lbs", dob: "2018-06-03", breeder: "Szychulda" },
  { key: "WG", name: "Szychulda WG", ear: "WG", sex: "doe", color: "Black", weight: "8.14 lbs", dob: "2019-12-24", breeder: "Szychulda" },
  { key: "GENESIS", name: "Luso Genesis", ear: "LSO188", sex: "doe", color: "Blue", reg: "P558M", weight: "8.1 lbs", dob: "2023-04-02", breeder: "Lusos", sire: "CW", dam: "ROCKET" },
  { key: "ROCKET", name: "Lusos Rocket Your World", ear: "LSO48", sex: "doe", color: "Blue", reg: "P551M", weight: "8.8 lbs", dob: "2021-02-05", breeder: "Lusos" },

  // ---- Dante (WT18), Walking Tree Rabbitry ----
  { key: "WT18", name: "WalkingTree's Dante", ear: "WT18", sex: "buck", color: "Torted Black/Orange Tri", dob: "2024-03-19", breeder: "Walking Tree Rabbitry", status: "herd", sire: "GHR21", dam: "LGRAL" },
  { key: "GHR21", name: "GHHR Scut Farkus", ear: "GHR21", sex: "buck", color: "B/O Tri", weight: "8 lbs 4 oz", dob: "2023-06-28", breeder: "GHHR", sire: "BUCKEE", dam: "F2" },
  { key: "BUCKEE", name: "Rise and Shine Buckee", ear: "RSRM", sex: "buck", color: "Broken Black Otter", weight: "8 lbs 5 oz", dob: "2022-06-26", breeder: "Rise and Shine", sire: "REGNER", dam: "TTWILLOW" },
  { key: "REGNER", name: "Tumble Tree Regner", ear: "TTRMB7", sex: "buck", color: "Broken Black Otter", weight: "7 lbs", dob: "2021-09-15", breeder: "Tumble Tree" },
  { key: "TTWILLOW", name: "Tumble Tree Willow", ear: "TTPWA2", sex: "doe", color: "Black Otter", weight: "8 lbs 2 oz", dob: "2020-11-11", breeder: "Tumble Tree" },
  { key: "F2", name: "Once Upon A Farm Willow", ear: "F2", sex: "doe", color: "Harlequinized Broken Black Otter", weight: "8 lbs", dob: "2022-12-03", breeder: "Once Upon A Farm", sire: "BINKY", dam: "MIDNIGHT" },
  { key: "BINKY", name: "GTRB Binky", ear: "RP3", sex: "buck", color: "B/O Tri", weight: "7 lbs 9 oz", dob: "2022-03-04", breeder: "GTRB" },
  { key: "MIDNIGHT", name: "GTRB Midnight", ear: "RP", sex: "doe", color: "Black Otter", weight: "9 lbs", dob: "2022-01-16", breeder: "GTRB" },
  { key: "LGRAL", name: "Lotus Gem Roxanne", ear: "LGRAL", sex: "doe", color: "Fox", weight: "7 lbs 3 oz", dob: "2023-10-06", breeder: "Lotus Gem", sire: "MONGOOSE", dam: "DATA" },
  { key: "MONGOOSE", name: "Lotus Gem Mongoose", ear: "LGRMO", sex: "buck", color: "White", weight: "8 lbs", dob: "2023-04-08", breeder: "Lotus Gem", sire: "BULLY", dam: "OPAL" },
  { key: "BULLY", name: "VC Bully", ear: "VCBULLY", sex: "buck", color: "Tort", weight: "8 lbs 12 oz", dob: "2019-01-02", breeder: "VC" },
  { key: "OPAL", name: "Opal", sex: "doe", color: "Opal", weight: "8 lbs 9 oz" },
  { key: "DATA", name: "Vanjager's Data", ear: "VJBQB8", sex: "doe", color: "Black/Orange Brindle", weight: "8 lbs 2 oz", dob: "2020-12-11", breeder: "Vanjager's", sire: "QUESTION", dam: "BATHSHEBA" },
  { key: "QUESTION", name: "VanJager Question", ear: "VJBOA3", sex: "buck", color: "Black/Orange Brindle", weight: "8 lbs 12 oz", dob: "2020-06-27", breeder: "Vanjager's" },
  { key: "BATHSHEBA", name: "Jumping J's Bathsheba", ear: "JJ590", sex: "doe", color: "Red", weight: "9 lbs 4 oz", dob: "2019-11-01", breeder: "Jumping J's" },

  // ---- 6AF2, 6 Acres Farm. His dam Ginny is also by HB/E 202, so HB/E 202 appears twice in his pedigree ----
  { key: "6AF2", name: "6AF's 6AF2", ear: "6AF2", sex: "buck", color: "Blue Tri", dob: "2025-12-16", breeder: "6 Acres Farm", status: "herd", sire: "HBE202", dam: "GINNY" },
  { key: "HBE202", name: "J&S Farms HB/E 202", ear: "HBE202", sex: "buck", color: "Broken Blue Otter", weight: "9 lbs", dob: "2024-02-18", breeder: "J&S Farms", sire: "HARLIBOY", dam: "ET23" },
  { key: "HARLIBOY", name: "CTFB Harli Boy", ear: "CD13", sex: "buck", color: "Harlequin", dob: "2023-05-22", breeder: "CTFB", sire: "CLYDE", dam: "DENALI" },
  { key: "CLYDE", name: "Winde Ridge Farms Clyde", ear: "CLYDE", sex: "buck", color: "Broken Black Otter", weight: "9 lbs 9 oz", dob: "2021-04-28", breeder: "Winde Ridge Farms" },
  { key: "DENALI", name: "Winde Ridge Farms Denali", ear: "DENALI", sex: "doe", color: "CH Silver Marten", weight: "9 lbs", dob: "2021-04-28", breeder: "Winde Ridge Farms" },
  { key: "ET23", name: "TFH ET2-3", ear: "ET2-3", sex: "doe", color: "Broken Blue", dob: "2022-12-30", breeder: "TFH", sire: "TITUS", dam: "ELEANOR" },
  { key: "TITUS", name: "Red Roof Farms Titus", ear: "RRF11", sex: "buck", color: "Broken Blue", weight: "9 lbs 11 oz", breeder: "Red Roof Farms" },
  { key: "ELEANOR", name: "Tiny Patch Farms Eleanor", ear: "E23", sex: "doe", color: "Blue", weight: "8 lbs", dob: "2021-05-16", breeder: "Tiny Patch Farms" },
  { key: "GINNY", name: "6AF's Ginny", ear: "6AF1", sex: "doe", color: "B/O Tri", weight: "8 lbs 3 oz", dob: "2024-09-22", breeder: "6 Acres Farm", sire: "HBE202", dam: "MOLLY" },
  { key: "MOLLY", name: "6AF Molly", ear: "RD01", sex: "doe", color: "Broken Castor", weight: "7 lbs", dob: "2022-06-26", breeder: "6 Acres Farm" },

  // ---- Jax's Ruger Blackhawk ("Harl Buck") ----
  { key: "JAXB34", name: "Jax's Ruger Blackhawk", ear: "JAXB34", sex: "buck", color: "Japanese - Blue", dob: "2024-05-13", breeder: "Jax's", status: "herd", notes: "\"Harl Buck\" is handwritten on the pedigree.", sire: "BLIZZARD", dam: "AMORE" },
  { key: "BLIZZARD", name: "Jax's Blizzard", ear: "JXB", sex: "buck", color: "Tricolor - W/Blu/G-Fawn", weight: "9 lbs", dob: "2023-04-12", breeder: "Jax's", sire: "GABE", dam: "VALENTINA" },
  { key: "GABE", name: "ADM's Gabe", ear: "4BJ", sex: "buck", color: "Tricolor - W/Blk/G-Org", weight: "5 lbs 5 oz", dob: "2022-07-27", breeder: "ADM's", sire: "JACK", dam: "BLAKELY" },
  { key: "JACK", name: "ADM's Jack", ear: "2SB", sex: "buck", color: "Broken Otter - Black", weight: "7 lbs 5 oz", dob: "2022-01-14", breeder: "ADM's" },
  { key: "BLAKELY", name: "ADM's Blakely", ear: "11H20", sex: "doe", color: "Tricolor - W/Choc/G-Org", weight: "5 lbs 8 oz", dob: "2020-12-17", breeder: "ADM's" },
  { key: "VALENTINA", name: "ADM's Valentina", ear: "1SK", sex: "doe", color: "Harlequin Black", weight: "9 lbs", dob: "2022-04-04", breeder: "ADM's", sire: "KADEN", dam: "SAVANNAH" },
  { key: "KADEN", name: "ADM's Kaden", ear: "2LX21", sex: "buck", color: "Tricolor - W/Blk/G-Org", weight: "7 lbs 6 oz", dob: "2021-07-18", breeder: "ADM's" },
  { key: "SAVANNAH", name: "ADM's Savannah", ear: "3EQ20", sex: "doe", color: "Black", weight: "8 lbs 3 oz", dob: "2020-03-06", breeder: "ADM's" },
  { key: "AMORE", name: "Jax's Amore", ear: "JXA", sex: "doe", color: "Tricolor - W/Blk/G-Org", weight: "11 lbs", dob: "2023-05-23", breeder: "Jax's", sire: "VEGAS", dam: "OOHMIAMOR" },
  { key: "VEGAS", name: "BW's Vegas", ear: "M", sex: "buck", color: "Tricolor - W/Lil/G-Fawn", weight: "8 lbs 14 oz", dob: "2021-03-18", breeder: "BW's", sire: "AL3L", dam: "HW2F" },
  { key: "AL3L", name: "BW's AL3L", ear: "AL3L", sex: "buck", color: "Tricolor - W/Blu/G-Fawn", weight: "8 lbs 12 oz", dob: "2018-12-25", breeder: "BW's" },
  { key: "HW2F", name: "BW's HW2F", ear: "HW2F", sex: "doe", color: "Japanese - Chocolate", weight: "9 lbs 1 oz", dob: "2019-06-02", breeder: "BW's" },
  { key: "OOHMIAMOR", name: "Gossamer's Ooh Mi Amor", ear: "OOH MI AMOR", sex: "doe", color: "Tricolor - W/Blk/G-Org", weight: "9 lbs 4 oz", dob: "2019-08-30", breeder: "Gossamer's", sire: "KAMIKAZE", dam: "OOHLALA" },
  { key: "KAMIKAZE", name: "Gossamer's Kamikaze", ear: "KAMIKAZE", sex: "buck", color: "Tricolor - W/Blk/G-Org", legs: "1", weight: "8 lbs 8 oz", dob: "2018-06-15", breeder: "Gossamer's" },
  { key: "OOHLALA", name: "Gossamer's Ooh La La", ear: "OOH LA LA", sex: "doe", color: "Tricolor - W/Blk/G-Org", weight: "7 lbs 8 oz", dob: "2018-05-05", breeder: "Gossamer's" },

  // ---- KA1901, Kemler Acres. Her parents RJ and Judith are littermates ----
  { key: "KA1901", name: "", ear: "KA1901", sex: "doe", color: "B/O Tri-color", weight: "2 lbs 15 oz", dob: "2025-02-16", breeder: "Kemler Acres", status: "herd", notes: "Weight is from the pedigree, taken as a junior.", sire: "RJ", dam: "JUDITH" },
  { key: "RJ", name: "Kemler Acres' RJ", ear: "KAMR24", sex: "buck", color: "B/O Brindle", weight: "7 lbs 12 oz", dob: "2024-04-01", breeder: "Kemler Acres", sire: "HERSHEL", dam: "MICHONNE" },
  { key: "JUDITH", name: "Kemler Acres' Judith", ear: "KAMJ24", sex: "doe", color: "B/O Tri-color", weight: "7 lbs", dob: "2024-04-01", breeder: "Kemler Acres", sire: "HERSHEL", dam: "MICHONNE" },
  { key: "HERSHEL", name: "Hershel", sex: "buck", color: "B/F Brindle", weight: "7 lbs 9 oz", dob: "2023-07-22" },
  { key: "MICHONNE", name: "Kemler Acres' Michonne", ear: "KAAM", sex: "doe", color: "B/O Tri-color", weight: "9 lbs 3 oz", dob: "2023-03-20", breeder: "Kemler Acres", sire: "NEGAN", dam: "MAGGIE" },
  { key: "NEGAN", name: "CR's Negan", ear: "KAON", sex: "buck", color: "B/O Tri-color", weight: "8 lbs", breeder: "CR's" },
  { key: "MAGGIE", name: "CR's Maggie", ear: "KAOM", sex: "doe", color: "B/O Harlequin", weight: "9 lbs 9 oz", breeder: "CR's" },

  // ---- FBC2, Triple Creek Rabbitry, sold to Jessica McCarthy on April 20, 2024 ----
  { key: "FBC2", name: "FBC2", sex: "doe", color: "Broken Castor", genotype: "A- B- C- D- E- Enen wewe", dob: "2024-02-12", breeder: "Triple Creek Rabbitry", status: "herd", acquired: "2024-04-20", sire: "ALADAR", dam: "BLANCA" },
  { key: "ALADAR", name: "Aladar", ear: "A TDAB1", sex: "buck", color: "Broken Otter - Black", genotype: "ata B- Cc Dd E- Enen wewe", weight: "7 lbs 8 oz", dob: "2023-01-01", breeder: "Triple Creek Rabbitry" },
  { key: "BLANCA", name: "Blanca", ear: "BLANCA", sex: "doe", color: "Castor", genotype: "Aa Bb C- D- E- W- enen wewe", weight: "8 lbs 8 oz", dob: "2023-08-11", breeder: "Triple Creek Rabbitry", sire: "BOSCO", dam: "MARILYN" },
  { key: "BOSCO", name: "Bosco", ear: "TCRBOSCO", sex: "buck", color: "Broken Torted Tri - Wht/Blk/Golden-Orange", genotype: "aa B- C- D- eje Ww Enen wewe", legs: "1", weight: "7 lbs 10 oz", dob: "2023-02-02", breeder: "Triple Creek Rabbitry", sire: "ARLO", dam: "ANASTASIA" },
  { key: "ARLO", name: "Arlo", sex: "buck", color: "Broken Castor", genotype: "Aa Bb C- D- E- Enen wewe", weight: "7 lbs 14 oz", dob: "2022-07-29" },
  { key: "ANASTASIA", name: "Anastasia", sex: "doe", color: "Black", genotype: "aa Bb C- D- E- enen wewe", weight: "8 lbs 5 oz", dob: "2022-01-04" },
  { key: "MARILYN", name: "Marilyn", ear: "A TCFAA", sex: "doe", color: "Castor", genotype: "A- Bb C- D- E- enen wewe", weight: "8 lbs 11 oz", dob: "2022-06-10", breeder: "Triple Creek Rabbitry" },
];

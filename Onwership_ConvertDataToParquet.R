require('arrow')
require('dplyr')
require("readxl")
require('tidyr')
require("purrr")

setwd('~/Documents/Ownership')

workbook_path <- 'Global-Energy-Ownership-Tracker-March-2025.xlsx'
sheet_names <- excel_sheets(workbook_path)
sheet_names

# Load sheets 2 and 3, which will be there own tables in our mini db.  
entitites <- read_excel(workbook_path, 'All Entities')
ownership <- read_excel(workbook_path, 'Entity Ownership')

# Grab names for worksheets that are ownership of different tracker items
tracker_sheets_names <- sheet_names[4:length(sheet_names)]

trackers_ownership_list <- tracker_sheets_names %>%
  map(\(x) read_excel(workbook_path, x))

all_trackers_ownership <- trackers_ownership_list %>%
  map2(tracker_sheets_names, ~ mutate(.x, Tracker = sub(' Ownership','',.y)))  %>%
  bind_rows()

# Write parquet files
arrow::write_parquet(entitites, 'entitites.parquet')
arrow::write_parquet(ownership, 'ownership.parquet')
arrow::write_parquet(all_trackers_ownership, 'all_trackers_ownership.parquet')

# add parquet files for related trackers (from https://github.com/GlobalEnergyMonitor/Ownership_External_Dataset/tree/main/Official%20Releases)
tracker_Gas_Plant <- read.csv("OwnershipTrackers/Global Oil and Gas Plant Tracker (GOGPT) - August 2025/Gas & Oil Units-Table 1.csv")
tracker_Coal_Plant <- read.csv("OwnershipTrackers/Global-Coal-Plant-Tracker-July-2025/Units-Table 1.csv")
tracker_Coal_Mine_not_closed <- read.csv('OwnershipTrackers/Global-Coal-Mine-Tracker-May-2025/GCMT Non-closed Mines-Table 1.csv')
tracker_Coal_Mine_closed <- read.csv('OwnershipTrackers/Global-Coal-Mine-Tracker-May-2025/GCMT Closed Mines-Table 1.csv')
tracker_Coal_Mine <- bind_rows(tracker_Coal_Mine_not_closed, tracker_Coal_Mine_closed)
# error -- need to fix join mine to closed mines
tracker_Bioenergy_Power <- read.csv("OwnershipTrackers/Global Bioenergy Power Tracker (GBPT) - V3 2/Data-Table 1.csv")
tracker_Iron_Mine <- read.csv("OwnershipTrackers/Global Iron Ore Mines Tracker - August 2025 - Standard Copy (V1)DATA TEAM COPY/Main Data-Table 1.csv")
tracker_Steel_Plant <- read.csv("OwnershipTrackers/Plant-level-data-Global-Iron-and-Steel-Tracker-March-2025-V1/Plant data-Table 1.csv")
tracker_Gas_Pipeline <- read.csv("OwnershipTrackers/GEM-GGIT-Gas-Pipelines-2024-12/Gas Pipelines 2024-12-17-Table 1.csv")

arrow::write_parquet(tracker_Gas_Plant, 'tracker_Gas_Plant.parquet')
arrow::write_parquet(tracker_Coal_Plant, 'tracker_Coal_Plant.parquet')
arrow::write_parquet(tracker_Coal_Mine_not_closed, 'tracker_Coal_Mine.parquet')
arrow::write_parquet(tracker_Bioenergy_Power, 'tracker_Bioenergy_Power.parquet')
arrow::write_parquet(tracker_Iron_Mine, 'tracker_Iron_Mine.parquet')
arrow::write_parquet(tracker_Steel_Plant, 'tracker_Steel_Plant.parquet')
arrow::write_parquet(tracker_Gas_Pipeline, 'tracker_Gas_Pipeline.parquet')

# grab geography from trackers
location_id_geo <- bind_rows(
  (tracker_Gas_Plant %>% select(GEM.location.ID, Latitude, Longitude, Country.Area, State.Province) %>% mutate(tracker= 'Gas Plant')),
  (tracker_Coal_Plant %>% select(GEM.location.ID, Latitude, Longitude, Country.Area, State.Province = Subnational.unit..province..state.) %>% mutate(tracker= 'Coal Plant')),
  (tracker_Coal_Mine_not_closed %>% select(GEM.location.ID = GEM.Mine.ID, Latitude, Longitude, Country.Area = Country...Area, State.Province = State..Province) %>% mutate(tracker= 'Coal Mine')),
  (tracker_Bioenergy_Power %>% select(GEM.location.ID, Latitude, Longitude, Country.Area, State.Province) %>% mutate(tracker= 'Bioenergy Power')),
  (tracker_Iron_Mine %>% separate(Coordinates, into = c("Latitude", "Longitude"), sep = ", ", convert = TRUE) %>% select(GEM.location.ID = GEM.Asset.ID,  Latitude, Longitude, Country.Area, State.Province = Subnational.unit) %>% mutate(tracker= 'Iron Mine')),     
  (tracker_Steel_Plant %>% separate(Coordinates, into = c("Latitude", "Longitude"), sep = ", ", convert = TRUE) %>% select(GEM.location.ID = Plant.ID, Latitude, Longitude, Country.Area, State.Province = Subnational.unit..province.state.) %>% mutate(tracker= 'Steel Plant')),
#  (tracker_Gas_Pipeline %>% select(GEM.location.ID, Latitude, Longitude, Countries) %>% mutate(tracker= 'Gas Pipeline')),
)

arrow::write_parquet(location_id_geo, 'asset_locations.parquet')

require('arrow')
require('dplyr')
require("readxl")
require('tidyr')
require("purrr")

setwd('~/Documents/Ownership')

workbook_path <- 'Global-Energy-Ownership-Tracker-November-2025-Data-Viz.xlsx'
sheet_names <- excel_sheets(workbook_path)
sheet_names

# Load sheets 1, 2 and 3, which will be there own tables in our mini db.  
# this will need to change when we get back to tracker than has metadata first tab. 
entitites <- read_excel(workbook_path, 'All Entities')
ownership <- read_excel(workbook_path, 'Entity Ownership')
assetOwnership <- read_excel(workbook_path, 'Asset Ownership')

# Grab names for worksheets that are ownership of different tracker items
tracker_sheets_names <- sheet_names[4:length(sheet_names)]

trackers_ownership_list <- tracker_sheets_names %>%
  map(\(x) read_excel(workbook_path, x))

all_trackers_ownership <- trackers_ownership_list %>%
  map2(tracker_sheets_names, ~ mutate(.x, Tracker = sub(' Ownership','',.y)))  %>%
  bind_rows() %>% 
  mutate(AssetId = case_match(Tracker, 
    'Gas Plant' ~ .data[["GEM unit ID"]],
    'Coal Plant' ~ .data[["GEM unit ID"]], # GEM unit phase ID
    'Coal Mine' ~ .data[["GEM Mine ID"]],
    'Bioenergy Power' ~ .data[["GEM unit ID"]], # GEM phase ID
    'Iron Mine' ~ .data[["GEM Asset ID"]],
    'Steel Plant' ~ .data[["Steel Plant ID"]], #  Plant ID
    'Cement and Concrete' ~ .data[["GEM Plant ID"]],
    'Gas Pipeline' ~ .data[["ProjectID"]],
    'Oil & NGL Pipeline' ~ .data[["ProjectID"]]
  ))

# Write parquet files
arrow::write_parquet(entitites, 'entitites.parquet')
arrow::write_parquet(ownership, 'ownership.parquet')
arrow::write_parquet(assetOwnership, 'assetOwnership.parquet')
arrow::write_parquet(all_trackers_ownership, 'all_trackers_ownership.parquet')

# add parquet files for related trackers (from https://github.com/GlobalEnergyMonitor/Ownership_External_Dataset/tree/main/Official%20Releases)
tracker_Gas_Plant <- read.csv("OwnershipTrackers/Global Oil and Gas Plant Tracker (GOGPT) - August 2025/Gas & Oil Units-Table 1.csv")
tracker_Coal_Plant <- read.csv("OwnershipTrackers/Global-Coal-Plant-Tracker-October-2025-Supplement-Proposals-outside-of-China/Units-Table 1.csv") 
tracker_Coal_Mine_not_closed <- read.csv('OwnershipTrackers/Global-Coal-Mine-Tracker-May-2025/GCMT Non-closed Mines-Table 1.csv')
tracker_Coal_Mine_closed <- read.csv('OwnershipTrackers/Global-Coal-Mine-Tracker-May-2025/GCMT Closed Mines-Table 1.csv')
tracker_Coal_Mine <- bind_rows(tracker_Coal_Mine_not_closed, tracker_Coal_Mine_closed)
# error -- need to fix join mine to closed mines
tracker_Bioenergy_Power <- read.csv("OwnershipTrackers/Global Bioenergy Power Tracker (GBPT) - V3 2/Data-Table 1.csv")
tracker_Iron_Mine <- read.csv("OwnershipTrackers/Global Iron Ore Mines Tracker - August 2025 - Standard Copy (V1)DATA TEAM COPY/Main Data-Table 1.csv")
tracker_Steel_Plant <- read.csv("OwnershipTrackers/Plant-level-data-Global-Iron-and-Steel-Tracker-March-2025-V1/Plant data-Table 1.csv")
tracker_Gas_Pipeline <- read.csv("OwnershipTrackers/GEM-GGIT-Gas-Pipelines-2025-11/Pipelines-Table 1.csv") 
tracker_Cement_and_Concrete <- read.csv("OwnershipTrackers/2025 Final_Global Cement and Concrete Tracker/Plant Data-Table 1.csv")
tracker_Oil_Infrastructure <- read.csv("OwnershipTrackers/GEM-GOIT-Oil-NGL-Pipelines-2025-03/Pipelines-Table 1.csv")  

arrow::write_parquet(tracker_Gas_Plant, 'tracker_Gas_Plant.parquet')
arrow::write_parquet(tracker_Coal_Plant, 'tracker_Coal_Plant.parquet')
arrow::write_parquet(tracker_Coal_Mine_not_closed, 'tracker_Coal_Mine.parquet')
arrow::write_parquet(tracker_Bioenergy_Power, 'tracker_Bioenergy_Power.parquet')
arrow::write_parquet(tracker_Iron_Mine, 'tracker_Iron_Mine.parquet')
arrow::write_parquet(tracker_Steel_Plant, 'tracker_Steel_Plant.parquet')
arrow::write_parquet(tracker_Gas_Pipeline, 'tracker_Gas_Pipeline.parquet')
arrow::write_parquet(tracker_Cement_and_Concrete, 'tracker_Cement_and_Concrete.parquet')
arrow::write_parquet(tracker_Oil_Infrastructure, 'tracker_Oil_Infrastructure.parquet')

# grab geography from trackers
location_id_geo <- bind_rows(
  (tracker_Gas_Plant %>% select(GEM.unit.ID, Latitude, Longitude, Country.Area, State.Province) %>% mutate(tracker= 'Gas Plant')),
  (tracker_Coal_Plant %>% select(GEM.unit.ID = GEM.unit.phase.ID, Latitude, Longitude, Country.Area, State.Province = Subnational.unit..province..state.) %>% mutate(tracker= 'Coal Plant')),
  (tracker_Coal_Mine_not_closed %>% select(GEM.unit.ID = GEM.Mine.ID, Latitude, Longitude, Country.Area = Country...Area, State.Province = State..Province) %>% mutate(tracker= 'Coal Mine')),
  (tracker_Bioenergy_Power %>% select(GEM.unit.ID = GEM.phase.ID, Latitude, Longitude, Country.Area, State.Province) %>% mutate(tracker= 'Bioenergy Power')),
  (tracker_Iron_Mine %>% separate(Coordinates, into = c("Latitude", "Longitude"), sep = ", ", convert = TRUE) %>% select(GEM.unit.ID = GEM.Asset.ID,  Latitude, Longitude, Country.Area, State.Province = Subnational.unit) %>% mutate(tracker= 'Iron Mine')),     
  (tracker_Steel_Plant %>% separate(Coordinates, into = c("Latitude", "Longitude"), sep = ", ", convert = TRUE) %>% select(GEM.unit.ID = Plant.ID, Latitude, Longitude, Country.Area, State.Province = Subnational.unit..province.state.) %>% mutate(tracker= 'Steel Plant')),
  (tracker_Cement_and_Concrete %>% mutate(Coordinates = ifelse(Coordinates == 'unknown' | Coordinates == 'P100000127742', " , ", Coordinates)) %>% 
     separate(Coordinates, into = c("Latitude", "Longitude"), sep = ", ", convert = TRUE) %>% select(GEM.unit.ID = GEM.Plant.ID, Latitude, Longitude, Country.Area, State.Province = Subnational.unit) %>% mutate(tracker= 'Cement-Concrete Plant')),
  #  (tracker_Gas_Pipeline %>% select(GEM.location.ID, Latitude, Longitude, Countries) %>% mutate(tracker= 'Gas Pipeline')),
  #  (tracker_Oil_Infrastructure %>% select(GEM.location.ID, Latitude, Longitude, Countries) %>% mutate(tracker= 'Gas Pipeline')),
  
)

arrow::write_parquet(location_id_geo, 'asset_locations.parquet')


# grab project names instead of unit names from trackers
project_names <- bind_rows(
  (tracker_Gas_Plant %>% select(id = GEM.unit.ID, name= Plant.name, unitName = Unit.name) %>% mutate(tracker= 'Gas Plant')),
  (tracker_Coal_Plant %>% select(id = GEM.unit.phase.ID, name = Plant.name, unitName = Unit.name) %>% mutate(tracker= 'Coal Plant')),
  (tracker_Coal_Mine_not_closed %>% select(id = GEM.Mine.ID, name = Complex.Name ) %>% mutate(tracker= 'Coal Mine')),
  (tracker_Bioenergy_Power %>% select(id = GEM.phase.ID, name = Project.Name, unitName = Unit.Name) %>% mutate(tracker= 'Bioenergy Power')),
  (tracker_Iron_Mine %>% select(id = GEM.Asset.ID, name = Asset.name..English. ) %>% mutate(tracker= 'Iron Mine')),     
  (tracker_Steel_Plant %>% select(id = Plant.ID, name = Plant.name..English.) %>% mutate(tracker= 'Steel Plant')),
  (tracker_Cement_and_Concrete %>% select(id = GEM.Plant.ID, name = GEM.Asset.name..English.) %>% mutate(tracker= 'Cement-Concrete Plant')),
  (tracker_Gas_Pipeline %>% mutate(name = paste(PipelineName, SegmentName, sep = ifelse(is.na(SegmentName), " - ", '')), tracker= 'Gas Pipeline')) %>% select(id = ProjectID, name, tracker),
  (tracker_Oil_Infrastructure %>% mutate(name = paste(PipelineName, SegmentName, sep = ifelse(is.na(SegmentName), " - ", '')), tracker= 'Oil Pipeline')) %>% select(id = ProjectID, name, tracker),
)

arrow::write_parquet(project_names, 'asset_names.parquet')
